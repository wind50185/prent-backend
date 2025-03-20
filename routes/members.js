import express from "express";
import db from "../utils/connect-mysql.js";
import { z } from "zod";
import jwt from "jsonwebtoken";

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email({ message: "請輸入正確的電子郵件" }),
  password: z.string().min(6, { message: "密碼至少需要 6 個字元" }),
});

const registerSchema = z.object({
  name: z.string().min(1, { message: "姓名為必填欄位" }),
  email: z.string().email({ message: "請輸入有效的電子郵件地址" }),
  password: z.string().min(6, { message: "密碼至少需要 6 個字元" }),
  phone: z.string().min(10, { message: "請輸入有效的手機號碼" }),
  nickname: z.string().min(1, { message: "暱稱為必填欄位" }),
});

// 登入
// router.post("/login", async (req, res) => {
//     const { email, password } = req.body;

//     const checkResult = loginSchema.safeParse({ email, password });
//     if (!checkResult.success) {
//         return res.status(400).json({ errors: checkResult.error.issues });
//     }

//     try {
//         const sql = "SELECT * FROM p_member WHERE email = ?";
//         const [rows] = await db.query(sql, [email]);

//         if (rows.length === 0) {
//             return res.status(400).json({ message: "無此帳號" });
//         }

//         const user = rows[0];

//         if (password !== user.member_password) {
//             return res.status(400).json({ message: "密碼錯誤" });
//         }

//         req.session.user = { id: user.id, email: user.email };

//         return res.status(200).json({ message: "登入成功", user: { id: user.id, email: user.email } });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ message: "伺服器錯誤，請稍後再試" });
//     }
// });

router.post("/login", async (req, res) => {
  const output = {
    success: false,
    code: 0,
    error: "",
    bodyData: req.body,
    data: {}, //回應給用戶的資料
  };
  let { email, password } = req.body;
  email = email.trim().toLowerCase();

  // 1. 是不是兩個欄位都有值
  if (!email || !password) {
    output.error = "欄位資料不足";
    return res.json(output);
  }
  // 2. 帳號正不正確
  const sql = `SELECT * FROM p_member WHERE email=? `;
  const [rows] = await db.query(sql, [email]);
  if (!rows.length) {
    // 帳號是錯的
    output.code = 400;
    output.error = "帳號或密碼錯誤";
    return res.json(output);
  }

  // const result = await bcrypt.compare(password, rows[0].password_hash);
  if (password !== rows[0].member_password) {
    output.code = 420;
    output.error = "帳號或密碼錯誤";
  } else {
    output.success = true;
    const token = jwt.sign(
      {
        id: rows[0].member_id,
        email: rows[0].email,
      },
      process.env.JWT_KEY
    );
    output.data = {
      token,
      member_id: rows[0].member_id,
      email: rows[0].email,
      nickname: rows[0].nick_name,
      img: rows[0].img,
      member_name: rows[0].member_name,
    };
  }

  return res.json(output);
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "登出失敗" });
    }
    return res.status(200).json({ message: "登出成功" });
  });
});

router.get("/profile", async (req, res) => {
  const memberId = req.my_jwt?.id || 0;

  try {
    const [rows] = await db.query(
      "SELECT * FROM p_member WHERE member_id = ?",
      [memberId]
    );
    if (rows.length) {
      console.log(rows[0]);
      return res.json(rows[0]);
    } else {
      return res.status(403).json({ message: "no user data" });
    }
  } catch (ex) {
    console.log({ ex });
    return res.status(500).json({ message: "資料庫查詢錯誤" });
  }
});

router.post("/register", async (req, res) => {
  const { name, email, password, phone, nickname, gender, birth } = req.body;

  const checkResult = registerSchema.safeParse({
    name,
    email,
    password,
    phone,
    nickname,
    birth,
  });
  if (!checkResult.success) {
    console.log("驗證錯誤:", checkResult.error.issues);
    return res.status(400).json({ errors: checkResult.error.issues });
  }

  try {
    const sqlCheckUser = "SELECT * FROM p_member WHERE email = ?";
    const [row] = await db.query(sqlCheckUser, [email]);

    if (row.length > 0) {
      return res.status(400).json({ message: "此電子郵件已經註冊" });
    }

    // 檢查 phone 是否已存在
    const sqlCheckPhone = "SELECT * FROM p_member WHERE phone = ?";
    const [phoneRows] = await db.query(sqlCheckPhone, [phone]);

    if (phoneRows.length > 0) {
      return res.status(400).json({ message: "此電話號碼已被使用" });
    }

    const sqlInsertUser =
      "INSERT INTO p_member (member_name, email, member_password, phone, nick_name, gender, birth) VALUES (?, ?, ?, ?, ?, ?, ?)";
    const result = await db.query(sqlInsertUser, [
      name,
      email,
      password,
      phone,
      nickname,
      gender,
      birth,
    ]);

    return res
      .status(201)
      .json({ message: "註冊成功", userId: result.insertId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "伺服器錯誤，請稍後再試" });
  }
});

router.post("/edit", async (req, res) => {
  const memberId = req.my_jwt?.id || 0;

  const output = {
    success: false,
    code: 0,
    error: "",
    bodyData: req.body,
    data: {}, //回應給用戶的資料
  };
  const { username, email, phone, nick_name } = req.body;

  if (!email || !username || !phone || !nick_name) {
    output.error = "欄位資料不足";
    return res.json(output);
  }

  const getUserSql = `SELECT * FROM p_member WHERE member_id = ?`;
  const [[user]] = await db.query(getUserSql, [memberId]);

  // **檢查是否完全沒有變更**
  if (
    user.email === email &&
    user.phone === phone &&
    user.member_name === username &&
    user.nick_name === nick_name
  ) {
    // output.success = true;
    output.code = 304; // 304 表示資料未變更
    output.error = "資料無變更";
    return res.json(output);
  }

  if (user.email !== email || user.phone !== phone) {
    const checkSql = `SELECT * FROM p_member WHERE (email = ? OR phone = ?) AND member_id != ?`;
    const [dataexist] = await db.query(checkSql, [email, phone, memberId]);

    if (dataexist.length > 0) {
      output.error = "此電子郵件或電話已經被使用";
      return res.json(output);
    }
  }
  const updateSql = `UPDATE p_member SET member_name = ?, phone = ?, email = ?, nick_name = ? WHERE member_id = ?`;
  let [rows_later] = await db.query(updateSql, [
    username,
    phone,
    email,
    nick_name,
    memberId,
  ]);

  if (rows_later.affectedRows > 0) {
    output.success = true;
    output.code = 200;
    output.data = { username, email, phone, nick_name };
  } else {
    output.error = "資料更新失敗";
  }

  return res.json(output);
});

router.get("/collect", async (req, res) => {
  let page = parseInt(req.query.page) || 1;
  if (page < 1) {
    return { redirect: `?page=1` };
  }

  const memberId = req.my_jwt?.id || 0;

  const perPage = 5;

  let t_sql = `SELECT COUNT(1) totalRows FROM collect WHERE member_id = ?`;

  const [[{ totalRows }]] = await db.query(t_sql, [memberId]);

  const totalPages = Math.ceil(totalRows / perPage);

  let rows = [];
  if (totalRows) {
    if (page > totalPages) {
      return { redirect: `?page=${totalPages}` };
    }
    let sql = `
            SELECT d.* FROM discuss d
            JOIN collect c ON d.dis_id = c.dis_id
            WHERE c.member_id = ?
            ORDER BY d.dis_setup_time DESC
            LIMIT ?, ?
        `;
    let queryParams = [memberId, perPage * (page - 1), perPage];

    [rows] = await db.query(sql, queryParams);

    for (let i = 0; i < rows.length; i++) {
      const replySql = `SELECT COUNT(*) AS reply_count FROM reply WHERE dis_id = ?`;
      const [[{ reply_count }]] = await db.query(replySql, [rows[i].dis_id]);
      rows[i].reply_count = reply_count;

      const collectSql = `SELECT 1 FROM collect WHERE member_id = ? AND dis_id = ?`;
      const [collectResult] = await db.query(collectSql, [
        memberId,
        rows[i].dis_id,
      ]);
      rows[i].is_collected = collectResult.length > 0;
    }
  }

  res.json({ perPage, page, totalPages, totalRows, rows });
});

export default router;
