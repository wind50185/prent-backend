import express from "express";
import db from "../utils/connect-mysql.js";
import jwt from "jsonwebtoken";

const router = express.Router();
router.use(express.json());

// 取得首頁商品的 API 路由
// http://localhost:3002/store
router.get("/", async (req, res) => {
  // const { newProducts, discountProducts, hotProducts } = req.query;

  try {
    const [newProductsData] = await db.query(`
      SELECT p.product_id, p.product_name, p.price, 
               COALESCE(i.image_url, '') AS image_path 
        FROM p_product p
        LEFT JOIN product_image i ON p.product_id = i.product_id AND i.is_primary = 1
        ORDER BY p.created_at DESC 
        LIMIT 10
  `);
    console.log("新商品:", newProductsData);

    const [discountProductsData] = await db.query(`
        SELECT p.product_id, p.product_name, p.price, 
               COALESCE(i.image_url, '') AS image_path 
        FROM p_product p
        LEFT JOIN product_image i ON p.product_id = i.product_id AND i.is_primary = 1
        ORDER BY p.product_id DESC 
        LIMIT 10
    `);
    // console.log("折扣商品:", discountProductsData);

    const [hotProductsData] = await db.query(`
        SELECT p.product_id, p.product_name, p.price, 
               COALESCE(i.image_url, '') AS image_path 
        FROM p_product p
        LEFT JOIN product_image i ON p.product_id = i.product_id AND i.is_primary = 1
        ORDER BY p.product_id 
        LIMIT 10
    `);
    // console.log("熱賣商品:", hotProductsData);

    res.json({
      newProducts: newProductsData,
      discountProducts: discountProductsData,
      hotProducts: hotProductsData,
    });
  } catch (error) {
    console.error("取得首頁商品時發生錯誤:", error);
    res.status(500).json({ error: error.message });
  }
});

// 取得商品列表的 API 路由
// http://localhost:3002/store/list
router.get("/list", async (req, res) => {
  const { category, color, sortOrder, search } = req.query;
  const page = Number(req.query.page) || 1; // 預設為第 1 頁
  const pageSize = 12; // 每頁顯示 12 個商品
  const offset = (page - 1) * pageSize; // 計算 offset

  console.log("Received category:", category, "Page:", page);

  let sql = `
    SELECT 
      p.product_id, p.product_name, p.price, p.amount, p.product_desc, 
      IFNULL(i.image_url, '') AS image_path
    FROM p_product p
    LEFT JOIN product_image i 
      ON p.product_id = i.product_id AND i.is_primary = 1
    LEFT JOIN product_category pc ON p.category_id = pc.category_id
    LEFT JOIN product_color col ON p.color_id = col.color_id
    WHERE 1
  `;

  let countQuery = `
    SELECT COUNT(*) AS total 
    FROM p_product p
    LEFT JOIN product_category pc ON p.category_id = pc.category_id
    LEFT JOIN product_color col ON p.color_id = col.color_id
    WHERE 1
  `;

  // 儲存篩選條件的參數
  const params = [];
  const countParams = []; // 計算總數時使用的參數

  if (category) {
    sql += ` AND p.category_id = ?`;
    countQuery += ` AND p.category_id = ?`;
    params.push(Number(category));
    countParams.push(Number(category));
  }
  if (color) {
    sql += ` AND p.color_id = ?`;
    countQuery += ` AND p.color_id = ?`;
    params.push(color);
    countParams.push(color);
  }
  if (search) {
    sql += ` AND p.product_name LIKE ?`;
    countQuery += ` AND p.product_name LIKE ?`;
    params.push(`%${search}%`);
    countParams.push(`%${search}%`);
  }

  // 排序條件
  if (sortOrder) {
    if (sortOrder === "price_asc") {
      sql += ` ORDER BY p.price ASC`;
    } else if (sortOrder === "price_desc") {
      sql += ` ORDER BY p.price DESC`;
    } else if (sortOrder === "date_desc") {
      sql += ` ORDER BY p.product_id DESC`;
    }
  } else {
    sql += ` ORDER BY p.product_id ASC`;
  }

  // 加入分頁
  sql += ` LIMIT ? OFFSET ?`;
  params.push(Number(pageSize), Number(offset));

  try {
    // 查詢商品列表
    const [rows] = await db.query(sql, params);

    // 查詢符合條件的商品總數
    const [totalRows] = await db.query(countQuery, countParams);
    const totalItems = totalRows[0].total; // 取得總商品數量
    const totalPages = Math.ceil(totalItems / pageSize); // 計算總頁數

    res.json({
      products: rows,
      totalPages: totalPages,
      currentPage: page,
      totalItems: totalItems,
    });
  } catch (error) {
    console.error("資料庫查詢錯誤:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// 取得單一商品詳情的 API 路由
// http://localhost:3002/store/list/17
router.get("/list/:id", async (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT 
      p.product_id, p.product_name, p.price, p.amount, p.product_desc, 
      COALESCE(i.image_url, '') AS image_path
    FROM p_product p
    LEFT JOIN product_image i 
      ON p.product_id = i.product_id
    WHERE p.product_id = ?
  `;

  try {
    const [rows] = await db.query(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "找不到商品" });
    }

    // 更新圖片路徑
    const product = rows[0];
    product.image_path = product.image_path.replace(
      "uploads/images/",
      "uploads/store_images/"
    );

    res.json(product); // 返回處理過的商品資料
  } catch (error) {
    console.error("取得商品詳情時發生錯誤:", error);
    res.status(500).json({ error: error.message });
  }
});

// JWT 認證中介層
const authenticateToken = (req, res, next) => {
  console.log("Request Headers:", req.headers);
  const token =
    req.headers["authorization"] && req.headers["authorization"].split(" ")[1];
  if (!token) return res.status(401).json({ error: "無效的 token" });

  jwt.verify(token, process.env.JWT_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: "無效的 token" });
    req.user = user; // 儲存用戶資料到 request 對象中
    next();
  });
};

// 獲取購物車資料 API
router.get("/cart", async (req, res) => {
  if (!req.my_jwt?.id) {
    return res.status(400).json({ error: "缺少會員 ID" });
  }
  const member_id = req.my_jwt?.id;
  try {
    const [cartItems] = await db.query(
      `SELECT sc.cart_id, sc.product_id, p.product_name, sc.amount, sc.total_price, 
              p.price AS product_price, pi.image_url 
       FROM store_cart sc
       LEFT JOIN p_product p ON sc.product_id = p.product_id
       LEFT JOIN product_image pi ON sc.product_id = pi.product_id AND pi.is_primary = 1
       WHERE sc.member_id = ?`,
      [member_id]
    );
    // console.log("購物車資料:", cartItems);
    res.json({ cartItems });
  } catch (err) {
    console.error("獲取購物車資料時發生錯誤:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

// 添加商品到購物車 API
router.post("/cart", authenticateToken, async (req, res) => {
  const { member_id, product_id, amount } = req.body;

  if (!member_id || !product_id || !amount) {
    return res.status(400).json({ error: "缺少必要的參數" });
  }
  try {
    const [productRows] = await db.query(
      `SELECT product_name, price AS product_price FROM p_product WHERE product_id = ?`,
      [product_id]
    );

    if (productRows.length === 0) {
      return res.status(404).json({ error: "商品不存在" });
    }

    // const productName = productRows[0].product_name;
    const productPrice = productRows[0].product_price;
    const totalPrice = productPrice * amount;

    // 檢查購物車中是否已經有該商品
    const [existingCartItem] = await db.query(
      `SELECT * FROM store_cart WHERE member_id = ? AND product_id = ?`,
      [member_id, product_id]
    );

    if (existingCartItem.length > 0) {
      // 如果商品已經在購物車中，則更新數量
      const updatedAmount = existingCartItem[0].amount + amount;
      await db.query(
        `UPDATE store_cart 
         SET amount = ?, total_price = ?, update_at = NOW() 
         WHERE member_id = ? AND product_id = ?`,
        [updatedAmount, totalPrice, member_id, product_id]
      );
    } else {
      // 否則新增購物車項目
      await db.query(
        `INSERT INTO store_cart (member_id, product_id, amount, product_price, total_price, added_at, update_at) 
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [member_id, product_id, amount, productPrice, totalPrice]
      );
    }

    const cartItems = await getCartItems(member_id);
    res.json({ message: "商品已成功加入購物車", cartItems });
  } catch (err) {
    console.error("添加商品到購物車時發生錯誤:", err);
    res.status(500).json({ error: err.message });
  }
});

// 獲取購物車資料 function
const getCartItems = async (member_id) => {
  if (!member_id) return null;
  try {
    const [cartItems] = await db.query(
      `SELECT * FROM store_cart WHERE member_id = ?`,
      [member_id]
    );
    return cartItems;
  } catch (err) {
    console.error("獲取購物車資料時發生錯誤:", err);
    return null;
  }
};

// 更新購物車中某個商品的數量
router.put("/cart/:cart_id", authenticateToken, async (req, res) => {
  const cart_id = req.params.cart_id;
  const { amount } = req.body;

  if (!amount || amount < 1) {
    return res.status(400).json({ error: "無效的數量" });
  }

  try {
    // 查找該商品在購物車中的項目
    const [existingCartItem] = await db.query(
      `SELECT * FROM store_cart WHERE cart_id = ?`,
      [cart_id]
    );

    if (existingCartItem.length === 0) {
      return res.status(404).json({ error: "該商品不存在於購物車中" });
    }

    // 查詢該商品的價格
    const [productRows] = await db.query(
      `SELECT price AS product_price FROM p_product WHERE product_id = ?`,
      [existingCartItem[0].product_id]
    );

    const productPrice = productRows[0].product_price;
    const totalPrice = productPrice * amount;

    // 更新商品數量和總價
    await db.query(
      `UPDATE store_cart 
       SET amount = ?, total_price = ?, update_at = NOW() 
       WHERE cart_id = ?`,
      [amount, totalPrice, cart_id]
    );

    // 取得最新購物車資料
    const cartItems = await getCartItems(existingCartItem[0].member_id);
    res.json({
      message: "購物車商品數量已更新",
      updatedAmount: amount,
      cartItems,
    });
  } catch (err) {
    console.error("更新購物車商品數量時發生錯誤:", err);
    res.status(500).json({ error: err.message });
  }
});

// 刪除購物車中的單個商品
router.delete("/cart/:cart_id", authenticateToken, async (req, res) => {
  const cart_id = req.params.cart_id;
  const member_id = req.user.id;

  if (!cart_id || !member_id) {
    return res.status(400).json({ error: "缺少必要的參數" });
  }

  try {
    // 確認該購物車商品是否存在，且屬於該會員
    const [existingCartItem] = await db.query(
      `SELECT * FROM store_cart WHERE cart_id = ? AND member_id = ?`,
      [cart_id, member_id]
    );

    if (existingCartItem.length === 0) {
      return res.status(404).json({ error: "該商品不在購物車中" });
    }

    // 從資料庫刪除該商品
    await db.query(`DELETE FROM store_cart WHERE cart_id = ?`, [cart_id]);

    // 取得最新的購物車資料
    const cartItems = await getCartItems(member_id);
    res.json({ message: "商品已從購物車刪除", cartItems });
  } catch (err) {
    console.error("刪除購物車商品時發生錯誤:", err);
    res.status(500).json({ error: err.message });
  }
});

// 獲取特定訂單資料
router.get("/order", async (req, res) => {
  if (!req.my_jwt?.id) {
    return res.status(400).json({ error: "缺少會員 ID" });
  }

  const member_id = req.my_jwt.id;
  const MerchantTradeNo = req.query.MerchantTradeNo;

  if (!MerchantTradeNo) {
    return res.status(400).json({ error: "缺少MerchantTradeNo" });
  }

  try {
    // 查詢訂單基本資料
    const [orders] = await db.query(
      `SELECT order_id, MerchantTradeNo, MerchantTradeDate, recipient_name, recipient_phone, recipient_email, shipping_address, total_price, payment_method, payment_status
       FROM store_order
       WHERE MerchantTradeNo = ? AND member_id = ?`,
      [MerchantTradeNo, member_id]
    );
    console.log("查詢結果:", orders);

    if (orders.length === 0) {
      return res.status(404).json({ error: "訂單不存在或無權查看" });
    }

    // 查詢付款方式名稱
    const [paymentMethodResult] = await db.query(
      `SELECT method_name FROM payment_method WHERE method_id = ?`,
      [orders[0].payment_method]
    );

    // 查詢付款狀態名稱
    const [paymentStatusResult] = await db.query(
      `SELECT status_name FROM payment_status WHERE status_id = ?`,
      [orders[0].payment_status]
    );

    // 查詢訂單商品明細
    const [orderItems] = await db.query(
      `SELECT od.order_detail_id, od.product_id, p.product_name, p.price, od.amount, od.total_price
       FROM order_detail od
       LEFT JOIN p_product p ON od.product_id = p.product_id
       WHERE od.order_id = ?`,
      [orders[0].order_id]
    );
    console.log("查詢結果:", orderItems);

    // 組合回傳結果
    res.json({
      orderDetails: {
        orderNumber: orders[0].MerchantTradeNo,
        orderDate: orders[0].MerchantTradeDate,
        name: orders[0].recipient_name,
        phone: orders[0].recipient_phone,
        email: orders[0].recipient_email,
        address: orders[0].shipping_address,
        totalAmount: orders[0].total_price,
        paymentMethod: paymentMethodResult[0]?.method_name,
        paymentStatus: paymentStatusResult[0]?.status_name,
      },
      orderItems: orderItems,
    });
  } catch (err) {
    console.error("獲取訂單資料時發生錯誤:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

// 獲取某會員的所有訂單資料
router.get("/orderall", async (req, res) => {
  if (!req.my_jwt?.id) {
    return res.status(400).json({ error: "缺少會員 ID" });
  }
  const member_id = req.my_jwt.id;
  console.log("會員 ID:", member_id);

  try {
    const [orders] = await db.query(
      `SELECT 
          so.MerchantTradeNo AS orderNumber, 
          so.MerchantTradeDate AS orderDate, 
          so.total_price, 
          so.recipient_name, 
          so.shipping_address
       FROM store_order AS so
       WHERE so.member_id = ?`,
      [member_id]
    );

    console.log("查詢結果:", orders);

    if (orders.length === 0) {
      return res.status(404).json({ error: "沒有找到任何訂單" });
    }

    // const orderIds = orders.map((order) => order.order_id);
    // const [orderItems] = await db.query(
    //   `SELECT
    //       od.order_id,
    //       od.order_detail_id,
    //       od.product_id,
    //       pp.product_name,
    //       od.amount,
    //       od.total_price
    //    FROM order_detail AS od
    //    LEFT JOIN p_product AS pp ON od.product_id = pp.product_id
    //    WHERE od.order_id IN (?)`,
    //   [orderIds]
    // );

    // console.log("查詢訂單商品結果:", orderItems);

    // 組合回傳結果
    // const formattedOrders = orders.map((order) => {
    //   return {
    //     orderNumber: order.MerchantTradeNo,
    //     orderDate: order.MerchantTradeDate,
    //     total_price: order.total_price,
    //     recipient_name: order.recipient_name,
    //     shipping_address: order.shipping_address,
    //     // items: orderItems.filter((item) => item.order_id === order.order_id),
    //   };
    // });

    res.json({ orders });
  } catch (err) {
    console.error("獲取訂單資料時發生錯誤:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

export default router;
