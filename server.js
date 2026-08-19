require("dotenv").config();
const express=require("express");
const mongoose=require("mongoose");
const multer=require("multer");
const cors=require("cors");
const helmet=require("helmet");
const path=require("path");
const fs=require("fs/promises");
const Product=require("./models/Product");

const app=express();
const PORT=Number(process.env.PORT)||3000;
const MONGODB_URI=process.env.MONGODB_URI;
const FRONTEND_ORIGIN=process.env.FRONTEND_ORIGIN||true;
const UPLOAD_DIR=path.resolve(process.env.UPLOAD_DIR||"./uploads");
const MAX_IMAGE_MB=Number(process.env.MAX_IMAGE_MB)||5;

if(!MONGODB_URI){console.error("❌ MONGODB_URI is missing");process.exit(1)}

app.disable("x-powered-by");
app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}}));
app.use(cors({origin:FRONTEND_ORIGIN,methods:["GET","POST","OPTIONS"],allowedHeaders:["Content-Type"]}));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true,limit:"1mb"}));

app.use("/uploads",express.static(UPLOAD_DIR,{maxAge:"7d"}));
app.use("/protected",express.static(path.join(__dirname,"protected"),{extensions:["html"]}));

mongoose.connection.on("connected",()=>console.log("✅ MongoDB connected"));
mongoose.connection.on("error",err=>console.error("❌ MongoDB error:",err));

const storage=multer.diskStorage({
  destination:(_req,_file,cb)=>cb(null,UPLOAD_DIR),
  filename:(_req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const base=path.basename(file.originalname,ext).replace(/[^a-z0-9_-]/gi,"-").replace(/-+/g,"-").slice(0,60)||"product";
    cb(null,`${base}-${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`);
  }
});
const upload=multer({storage,fileFilter:(_req,file,cb)=>file.mimetype.startsWith("image/")?cb(null,true):cb(new Error("Only image files are allowed.")),limits:{fileSize:MAX_IMAGE_MB*1024*1024,files:1}});

const bool=(v,f=false)=>typeof v==="boolean"?v:typeof v==="string"?(v.toLowerCase()==="true"?true:v.toLowerCase()==="false"?false:f):f;
const list=v=>Array.isArray(v)?v.map(String).map(s=>s.trim()).filter(Boolean):typeof v==="string"?v.split(",").map(s=>s.trim()).filter(Boolean):[];
const imageUrl=(req,file)=>file?`${req.protocol}://${req.get("host")}/uploads/${encodeURIComponent(file)}`:null;
const serialize=(req,p)=>({...p,imageUrl:imageUrl(req,p.image),availible:p.available,finalPrice:Math.round(p.price-(p.price*p.discount)/100)});

app.get("/api/health",(_req,res)=>res.json({success:true,database:mongoose.connection.readyState===1?"connected":"disconnected"}));

app.get("/api/products",async(req,res,next)=>{
  try{
    const filter={};
    if(req.query.category)filter.category=String(req.query.category).trim();
    if(req.query.available==="true")filter.available=true;
    if(req.query.available==="false")filter.available=false;
    const products=await Product.find(filter).sort({available:-1,createdAt:-1}).lean();
    res.json({success:true,count:products.length,products:products.map(p=>serialize(req,p))});
  }catch(e){next(e)}
});

app.get("/api/products/:id",async(req,res,next)=>{
  try{
    const product=await Product.findOne({id:req.params.id.toUpperCase()});
    if(!product)return res.status(404).json({success:false,message:"Product not found"});
    res.json({success:true,product:serialize(req,product.toObject({virtuals:true}))});
  }catch(e){next(e)}
});

// Development-stage write route. No authentication yet, by design for this phase.
app.post("/api/products",upload.single("image"),async(req,res,next)=>{
  try{
    const price=Number(req.body.price);
    const discount=req.body.discount===""||req.body.discount===undefined?0:Number(req.body.discount);
    const data={
      id:String(req.body.id||"").trim().toUpperCase(),name:String(req.body.name||"").trim(),price,discount,
      description:String(req.body.description||"").trim(),category:String(req.body.category||"").trim(),
      mostSell:bool(req.body.mostSell,false),available:bool(req.body.available,true),
      colors:list(req.body.colors),sizes:list(req.body.sizes),image:req.file?.filename||null
    };
    if(!data.id||!data.name||!data.category||!Number.isFinite(price)||price<0||!Number.isFinite(discount)||discount<0||discount>100||!req.file){
      if(req.file)await fs.unlink(req.file.path).catch(()=>{});
      return res.status(400).json({success:false,message:"Required product fields or image are missing/invalid"});
    }
    if(await Product.exists({id:data.id})){
      await fs.unlink(req.file.path).catch(()=>{});
      return res.status(409).json({success:false,message:`Product ID ${data.id} already exists`});
    }
    const product=await Product.create(data);
    res.status(201).json({success:true,message:"Product created",product:serialize(req,product.toObject({virtuals:true}))});
  }catch(e){if(req.file)await fs.unlink(req.file.path).catch(()=>{});next(e)}
});

app.use((err,_req,res,_next)=>{
  console.error("❌ API error:",err);
  if(err instanceof multer.MulterError)return res.status(400).json({success:false,message:err.code==="LIMIT_FILE_SIZE"?`Image exceeds ${MAX_IMAGE_MB} MB`:err.message});
  if(err.message==="Only image files are allowed.")return res.status(400).json({success:false,message:err.message});
  if(err.code===11000)return res.status(409).json({success:false,message:"Product ID already exists"});
  res.status(500).json({success:false,message:"Internal server error"});
});

(async()=>{
  try{
    await fs.mkdir(UPLOAD_DIR,{recursive:true});
    await mongoose.connect(MONGODB_URI,{serverSelectionTimeoutMS:10000});
    app.listen(PORT,"0.0.0.0",()=>console.log(`🚀 Server listening on port ${PORT}`));
  }catch(e){console.error("❌ Startup failed:",e);process.exit(1)}
})();
