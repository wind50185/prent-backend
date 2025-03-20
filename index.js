import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import session from "express-session";
import mysql_session from "express-mysql-session";
import db from "./utils/connect-mysql.js";
import jwt from "jsonwebtoken";

import loginRoute from "./routes/members.js";
import discussRoute from "./routes/discuss.js";
import rentRouter from "./routes/rent.js";
import StoreRouter from "./routes/store.js";
import ecpayRouter from "./routes/ecpay-test-only.js";
import serviceRouter from "./routes/service.js";

const MysqlStore = mysql_session(session);
const sessionStore = new MysqlStore({}, db);

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use((req, res, next) => {
  next();
});

app.use(cors(corsOptions));

// middleware: 解析 application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// session 設定
app.use(
  session({
    saveUninitialized: false,
    resave: false,
    secret: "kjds38745UGJ8374583",
    store: sessionStore,
  })
);

// 自訂頂層的 middleware
app.use((req, res, next) => {
  res.locals.pageName = "";
  res.locals.query = req.query; // query string 解析後的資料
  res.locals.session = req.session; // 讓 template 可以取得 session 的資料
  res.locals.originalUrl = req.originalUrl; //  讓 template 可以知道目前的路徑

  const auth = req.get("Authorization");
  if (auth && auth.indexOf("Bearer ") === 0) {
    const token = auth.slice(7); // 去掉 "Bearer ";
    try {
      const payload = jwt.verify(token, process.env.JWT_KEY);
      req.my_jwt = payload;
    } catch (ex) {
      console.log(ex);
    }
  }
  next();
});
app.use("/members", loginRoute);
app.use("/discuss", discussRoute);
// 路由設置
// .get() 只接收 HTTP GET 方法
// 路由的條件: 1. HTTP 方法, 2. 路徑
app.get("/", (req, res) => {
  res.render("home", { name: "小明" });
});

// 商品相關路由
app.use("/store", StoreRouter);
app.use("/ecpay", ecpayRouter);

// navbar獲取購物車資料 API
app.get("/store/cart", async (req, res) => {
  const member_id = req.user.id;
  if (!member_id) {
    return res.status(400).json({ error: "未登入或無效會員 ID" });
  }

  try {
    const [cartItems] = await db.query(
      `SELECT sc.product_id, p.product_name, sc.amount, p.price AS product_price 
        FROM store_cart sc 
        JOIN p_product p ON sc.product_id = p.product_id 
        WHERE sc.member_id = ?`,
      [member_id]
    );
    res.json(cartItems);
  } catch (err) {
    console.error("獲取購物車資料時發生錯誤:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

// 租屋頁面路由
app.use("/rent", rentRouter);

// 處理商城靜態檔案
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 服務路由
app.use("/service", serviceRouter);

// 處理服務靜態檔案
app.use(express.static("public"));

// 404 處理
app.use((req, res) => {
  res.status(404).send(`<h1>走錯路了</h1>`);
});

// 設定監聽通訊埠
const port = process.env.WEB_PORT || 3002;
app.listen(port, () => {
  console.log(`Server 啟動 ${port}`);
});
