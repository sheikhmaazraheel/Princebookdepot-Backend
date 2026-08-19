const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
  id:{type:String,required:true,unique:true,trim:true,uppercase:true,index:true},
  name:{type:String,required:true,trim:true,maxlength:180},
  price:{type:Number,required:true,min:0},
  discount:{type:Number,default:0,min:0,max:100},
  description:{type:String,default:"",trim:true,maxlength:5000},
  category:{type:String,required:true,trim:true,index:true},
  mostSell:{type:Boolean,default:false,index:true},
  available:{type:Boolean,default:true,index:true},
  image:{type:String,default:null},
  colors:{type:[String],default:[]},
  sizes:{type:[String],default:[]}
},{timestamps:true,versionKey:false});
productSchema.virtual("finalPrice").get(function(){return Math.round(this.price-(this.price*this.discount)/100)});
productSchema.set("toJSON",{virtuals:true});
module.exports=mongoose.model("Product",productSchema);
