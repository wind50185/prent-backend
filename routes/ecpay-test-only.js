import express from "express";
const router = express.Router();
import db from "../utils/connect-mysql.js";
import * as crypto from "crypto";
import { isDev, errorResponse } from "../lib/utils.js";

// 測試查看 req.query 內容
// router.get("/test-query", (req, res) => {
//   console.log("Received query parameters:", req.query);
//   return res.json({
//     message: "Query parameters received",
//     query: req.query,
//   });
// });

// GET home page
router.get("/", async function (req, res) {
  // console.log("收到的查詢參數：", req.query);
  const total_price = Number(req.query.total_price) || 0;
  // const items = req.query.items || "";
  const itemName = req.query.itemName || "租豬幫家具商城購買之商品";

  const {
    member_id,
    recipient_name,
    recipient_phone,
    recipient_email,
    shipping_address,
    payment_status,
    order_status,
    items,
  } = req.query;

  let parsedItems = [];
  try {
    parsedItems = items ? JSON.parse(items) : [];
  } catch (error) {
    return res.status(400).json({ error: "無效的 items 格式" });
  }

  if (isDev) {
    console.log("total_price:", total_price);
    console.log("itemName:", itemName);
    console.log("parsedItems:", parsedItems);
  }

  if (!total_price) {
    return errorResponse(res, "缺少總金額");
  }

  //綠界全方位金流技術文件：
  // https://developers.ecpay.com.tw/?p=2856
  // 信用卡測試卡號：4311-9522-2222-2222 安全碼 222
  //一、選擇帳號，是否為測試環境
  // 綠界支付 API 參數
  const MerchantID = "3002607";
  const HashKey = "pwFHCqoQZGmho4w6";
  const HashIV = "EkRm7iFT261dpevs";
  let isStage = true;

  //二、輸入參數
  const TotalAmount = total_price;
  const TradeDesc = "商店線上付款";
  const ItemName = itemName;
  // 付款結果通知回傳網址(這網址可能需要網路上的真實網址或IP，才能正確接收回傳結果)
  const ReturnURL = "https://www.ecpay.com.tw";
  // (二選一)以下這個設定，會有回傳結果，但要用前端的api路由來接收並協助重新導向到前端成功callback頁面(不用時下面要83~97從中的值要註解)
  // const OrderResultURL = 'http://localhost:3000/ecpay/api' //前端成功頁面api路由(POST)
  // (二選一)以下這個設定，不會任何回傳結果(不用時下面要83~97從中的值要註解)
  // const ClientBackURL = `http://localhost:3000/store/checkout/payment`;
  const MerchantTradeNo = `od${new Date().getFullYear()}${(
    new Date().getMonth() + 1
  )
    .toString()
    .padStart(2, "0")}${new Date()
    .getDate()
    .toString()
    .padStart(2, "0")}${new Date()
    .getHours()
    .toString()
    .padStart(2, "0")}${new Date()
    .getMinutes()
    .toString()
    .padStart(2, "0")}${new Date()
    .getSeconds()
    .toString()
    .padStart(2, "0")}${new Date().getMilliseconds().toString().padStart(2)}`;

  const ClientBackURL = `http://localhost:3000/store/checkout/payment?MerchantTradeNo=${MerchantTradeNo}`;
  const ChoosePayment = "ALL";

  const stage = isStage ? "-stage" : "";
  const algorithm = "sha256";
  const digest = "hex";
  const APIURL = `https://payment${stage}.ecpay.com.tw//Cashier/AioCheckOut/V5`;

  const MerchantTradeDate = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  //三、計算 CheckMacValue 之前
  let ParamsBeforeCMV = {
    MerchantID: MerchantID,
    MerchantTradeNo: MerchantTradeNo,
    MerchantTradeDate: MerchantTradeDate.toString(),
    PaymentType: "aio",
    EncryptType: 1,
    TotalAmount: TotalAmount,
    TradeDesc: TradeDesc,
    ItemName: ItemName,
    ReturnURL: ReturnURL,
    ChoosePayment: ChoosePayment,
    //OrderResultURL,
    ClientBackURL,
  };

  //四、計算 CheckMacValue
  function CheckMacValueGen(parameters, algorithm, digest) {
    let Step0;
    Step0 = Object.entries(parameters)
      .map(([key, value]) => `${key}=${value}`)
      .join("&");

    function DotNETURLEncode(string) {
      const list = {
        "%2D": "-",
        "%5F": "_",
        "%2E": ".",
        "%21": "!",
        "%2A": "*",
        "%28": "(",
        "%29": ")",
        "%20": "+",
      };

      Object.entries(list).forEach(([encoded, decoded]) => {
        const regex = new RegExp(encoded, "g");
        string = string.replace(regex, decoded);
      });

      return string;
    }

    const Step1 = Step0.split("&")
      .sort((a, b) => {
        const keyA = a.split("=")[0];
        const keyB = b.split("=")[0];
        return keyA.localeCompare(keyB);
      })
      .join("&");
    const Step2 = `HashKey=${HashKey}&${Step1}&HashIV=${HashIV}`;
    const Step3 = DotNETURLEncode(encodeURIComponent(Step2));
    const Step4 = Step3.toLowerCase();
    const Step5 = crypto.createHash(algorithm).update(Step4).digest(digest);
    const Step6 = Step5.toUpperCase();
    return Step6;
  }

  const CheckMacValue = CheckMacValueGen(ParamsBeforeCMV, algorithm, digest);
  //五、將所有的參數製作成 payload
  const AllParams = { ...ParamsBeforeCMV, CheckMacValue };
  // return res.json(AllParams);
  const sql3 = `
  INSERT INTO store_order (
  member_id, order_status, total_price,
  shipping_address, payment_status, MerchantTradeDate,
  recipient_name, recipient_phone, recipient_email,
  MerchantTradeNo
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;
  try {
    const [result] = await db.query(sql3, [
      member_id,
      order_status,
      total_price,
      shipping_address,
      payment_status,
      MerchantTradeDate,
      recipient_name,
      recipient_phone,
      recipient_email,
      MerchantTradeNo,
    ]);

    // 訂單建立成功，跳轉到付款頁面
    // const sql = `
    // INSERT INTO store_order (
    // member_id, payment_method, total_price,
    // shipping_address, payment_status, order_status,
    // recipient_name, recipient_phone, recipient_email,
    // MerchantTradeNo
    // ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    // `;

    const order_id = result.insertId; // 取得新訂單的 order_id
    console.log("新訂單 ID:", order_id);

    // **插入 order_detail 表格**
    const sql4 = `
      INSERT INTO order_detail (order_id, product_id, amount, unit_price)
VALUES (?, ?, ?, ?);
    `;

    if (parsedItems.length > 0) {
      for (const item of parsedItems) {
        await db.query(sql4, [
          order_id,
          item.product_id,
          item.amount,
          item.unit_price,
        ]);
      }
    }

    // **繼續處理付款 API**
    const inputs = Object.entries(AllParams)
      .map(function (param) {
        return `<input name=${param[0]} value="${param[1]}" style="display:none"><br/>`;
      })
      .join("");

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><title></title></head>
<body>
  <form method="post" action="${APIURL}" style="display:none">
    ${inputs}
    <input type="submit" value="送出參數" style="display:none">
  </form>
  <script>document.forms[0].submit();</script>
</body>
</html>
`;
    res.send(htmlContent);
  } catch (ex) {
    console.error("錯誤:", ex);
    return res.send(`insert error!`);
  }
});

export default router;
