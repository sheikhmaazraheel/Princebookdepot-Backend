# WhatsApp confirmation setup

The order flow uses the official Meta WhatsApp Cloud API.

## Render variables

Set these in the Backend Render service:

```env
WHATSAPP_API_VERSION=v25.0
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_APP_SECRET=...
WHATSAPP_CONFIRMATION_TEMPLATE=order_confirmation
WHATSAPP_TEMPLATE_LANGUAGE=en_US
WHATSAPP_ADMIN_PHONE=923xxxxxxxxx
WHATSAPP_ADMIN_ALERT_TEMPLATE=order_admin_alert
```

Never expose `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_APP_SECRET` in frontend files.

## Customer template

Create and get approval for a Utility template named `order_confirmation` with three body variables:

```text
Hello {{1}}, we received order {{2}} for {{3}}. Please confirm or cancel this order using the buttons below.
```

Add two quick-reply buttons in this order:

1. `Confirm order`
2. `Cancel order`

The backend supplies dynamic button payloads, so the button IDs must be left as the template button payloads. The webhook identifies them from the generated payload `CONFIRM_ORDER:<orderId>` and `CANCEL_ORDER:<orderId>`.

## Admin alert template

For reliable alerts outside a 24-hour customer-service window, create an approved Utility template named `order_admin_alert` with four body variables:

```text
Order {{1}} is {{2}} by {{3}}. Total: {{4}}. Check the admin dashboard.
```

The button/customer flow requires customers to have opted in to WhatsApp messages. Only send messages to customers who gave that consent.

## Meta webhook

Set the callback URL to:

```text
https://princebookdepot-backend.onrender.com/api/whatsapp/webhook
```

Use the same value as `WHATSAPP_VERIFY_TOKEN` in Meta's verification form. Subscribe the WhatsApp Business Account to the `messages` webhook field.

After deployment, verify the callback. A new order will send the customer template. Tapping `Confirm order` changes the order status to `confirmed` and sends the admin alert. Tapping `Cancel order` changes it to `cancelled`.
