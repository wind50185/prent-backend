import express from "express";
import db from "../utils/connect-mysql.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import multer from "multer";

const router = express.Router();

const postSchema = z.object({
  title: z.string().min(1, { message: "此欄位不可為空" }),
  content: z.string().min(1, { message: "此欄位不可為空" }),
});

// 文章列表頁
router.get("/", async (req, res) => {
  let page = parseInt(req.query.page) || 1;
  if (page < 1) {
    return { redirect: `?page=1` };
  }

  const memberId = req.my_jwt?.id || 0;

  let rawKeyword = req.query.keyword || "";
  let keyword = rawKeyword.trim();

  let selectedCategory = req.query.selectedCategory || 0;

  console.log("class:", selectedCategory);

  const perPage = 5;

  let t_sql = `SELECT COUNT(1) totalRows FROM discuss`;
  let searchWhereClause = "";

  if (keyword) {
    keyword = `%${keyword}%`;
    searchWhereClause = " WHERE dis_title LIKE ? ";
    t_sql += searchWhereClause;
  }

  // 如果選擇了分類，根據分類過濾
  if (selectedCategory && selectedCategory != 0) {
    searchWhereClause += searchWhereClause ? " AND " : " WHERE ";
    searchWhereClause += "d.category = ?"; // 假設 `category` 是討論區的分類欄位
    t_sql += searchWhereClause;
  }

  const [[{ totalRows }]] = await db.query(
    t_sql,
    keyword ? [keyword, selectedCategory] : [selectedCategory]
  );
  const totalPages = Math.ceil(totalRows / perPage);

  let rows = [];
  if (totalRows) {
    if (page > totalPages) {
      return { redirect: `?page=${totalPages}` };
    }
    // let sql = `SELECT * from discuss ${searchWhereClause} ORDER BY dis_setup_time DESC LIMIT ?, ?`;
    let sql = `SELECT 
                d.*, 
                COUNT(CASE WHEN df.reaction = 1 THEN 1 END) AS dis_like, 
                COUNT(CASE WHEN df.reaction = 0 THEN 1 END) AS dis_dislike,
                (SELECT df3.reaction 
                  FROM discuss_fa df3 
                  WHERE df3.dis_id = d.dis_id 
                    AND df3.member_id = ? 
                  LIMIT 1) AS user_reaction
            FROM discuss d
            LEFT JOIN discuss_fa df ON df.dis_id = d.dis_id
            ${searchWhereClause} 
            GROUP BY d.dis_id
            ORDER BY d.dis_setup_time DESC 
            LIMIT ?, ?`;
    let queryParams = keyword
      ? [memberId, keyword, perPage * (page - 1), perPage]
      : [memberId, perPage * (page - 1), perPage];

    [rows] = await db.query(sql, queryParams);
    console.log("Rows data:", rows);

    // 每篇文章reply數量
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

// 文章詳情頁
router.get("/article/:id", async (req, res) => {
  const { id } = req.params;
  const memberId = req.my_jwt?.id || 0;

  // const sql = `SELECT d.*, m.nick_name, m.img FROM discuss d JOIN p_member m ON d.member_id = m.member_id WHERE d.dis_id = ?`;
  const sql = `
    SELECT 
      d.*, 
      m.nick_name, 
      m.img, 
      COUNT(CASE WHEN df.reaction = '1' THEN 1 END) AS dis_like,
      COUNT(CASE WHEN df.reaction = '0' THEN 1 END) AS dis_dislike,
      MAX(CASE WHEN df2.member_id = ? AND df2.reaction = '1' THEN 1 
               WHEN df2.member_id = ? AND df2.reaction = '0' THEN 0 
               ELSE NULL END) AS user_reaction
    FROM 
      discuss d
    JOIN 
      p_member m ON d.member_id = m.member_id
    LEFT JOIN 
      discuss_fa df ON df.dis_id = d.dis_id
    LEFT JOIN 
      discuss_fa df2 ON df2.dis_id = d.dis_id AND df2.member_id = ?
    WHERE 
      d.dis_id = ?
    GROUP BY 
      d.dis_id
  `;
  const r_sql = `SELECT r.*, m.nick_name, m.img FROM reply r JOIN p_member m ON r.member_id = m.member_id WHERE r.dis_id = ?`;
  // 計算總留言數量
  const t_sql = `SELECT COUNT(*) reply_count FROM reply WHERE dis_id = ?`;
  const collect_sql = `SELECT 1 FROM collect WHERE member_id = ? AND dis_id = ?`;
  try {
    const [rows] = await db.query(sql, [memberId, memberId, memberId, id]);
    const [replyrows] = await db.query(r_sql, [id]);
    const [totalrows] = await db.query(t_sql, [id]);
    const [collectrows] = await db.query(collect_sql, [memberId, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "找不到文章" });
    }

    res.json({
      article: rows[0],
      reply: replyrows,
      reply_count: totalrows[0],
      collect: collectrows.length > 0,
      user_reaction: rows[0].user_reaction,
    });
  } catch (error) {
    console.error("取得文章發生錯誤:", error);
    res.status(500).json({ error: error.message });
  }
});

// 文章回覆
router.post("/reply", async (req, res) => {
  const memberId = req.my_jwt?.id || 0;

  if (memberId === 0) {
    return res.status(401).json({ message: "未登入或無效的會員 ID" });
  }
  const { dis_id, reply_content } = req.body;

  try {
    const sql =
      "INSERT INTO reply (member_id, dis_id, reply_content) VALUES (?, ?, ?)";
    const result = await db.query(sql, [memberId, dis_id, reply_content]);

    return res.status(201).json({ message: "回覆成功", result });
  } catch (ex) {
    console.log({ ex });
    return res.status(400).json({ message: "回覆錯誤", error: ex.message });
  }
});

// 文章收藏
router.post("/collect", async (req, res) => {
  const memberId = req.my_jwt?.id || 0;
  const { dis_id } = req.body;

  console.log(memberId, dis_id);
  try {
    const collect_sql = "INSERT INTO collect (member_id, dis_id) VALUES (?, ?)";
    const collect = await db.query(collect_sql, [memberId, dis_id]);

    console.log(collect);
    res.json({ success: true, message: "收藏成功" });
  } catch (error) {
    console.error("收藏過程中發生錯誤:", error);
    return res
      .status(403)
      .json({ success: false, message: "伺服器錯誤，請稍後再試" });
  }
});

router.delete("/collect", async (req, res) => {
  const memberId = req.my_jwt?.id || 0;
  const { dis_id } = req.body;

  try {
    const collect_sql =
      "DELETE FROM collect WHERE member_id = ? AND dis_id = ?";
    const collect = await db.query(collect_sql, [memberId, dis_id]);

    console.log(collect);
    res.json({ success: true, message: "解除收藏成功" });
  } catch (error) {
    console.error("解除收藏過程中發生錯誤:", error);
    return res
      .status(403)
      .json({ success: false, message: "伺服器錯誤，請稍後再試" });
  }
});

// 設定存放檔案的方式
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/discuss_images/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// 建立 `upload` 物件
const upload = multer({ storage });

// 文章發文頁
router.post("/post", upload.single("dis_img"), async (req, res) => {
  try {
    console.log("上傳的檔案:", req.file);
    console.log("收到的表單資料:", req.body);

    const { disclass, title, content } = req.body;
    const memberId = req.my_jwt?.id || 0;

    if (memberId === 0) {
      return res.status(401).json({ message: "未登入或無效的會員 ID" });
    }

    if (title.length > 20) {
      return res.status(400).json({ message: "標題不能超過 20 個字" });
    }

    if (!disclass) {
      return res.status(400).json({ message: "請選擇看板" });
    }

    if (!title || !content) {
      return res.status(400).json({ message: "標題與內容不可為空" });
    }

    if (content.length > 1000) {
      return res.status(400).json({ message: "內容過長" });
    }

    // 取得圖片的存放路徑
    const imageUrl = req.file
      ? `uploads/discuss_images/${req.file.filename}`
      : null;

    console.log("最終寫入的資料:", { disclass, title, content, imageUrl });

    const sql = `
      INSERT INTO discuss (member_id, dis_class, dis_title, dis_content, dis_pic)
      VALUES (?, ?, ?, ?, ?)`;

    const [result] = await db.query(sql, [
      memberId,
      disclass,
      title,
      content,
      imageUrl,
    ]);

    res.status(201).json({
      message: "發文成功",
      post: {
        id: result.insertId,
        member_id: memberId,
        disclass,
        title,
        content,
        dis_img: imageUrl,
      },
    });
  } catch (error) {
    console.error("發文錯誤:", error);
    res.status(500).json({ message: "伺服器錯誤", error: error.message });
  }
});

// 按讚與倒讚
router.post("/reaction", async (req, res) => {
  const { dis_id, reaction } = req.body; // reaction: 1 (讚), 0 (倒讚), or null
  const memberId = req.my_jwt?.id || 0;

  if (!dis_id || (reaction !== 1 && reaction !== 0 && reaction !== null)) {
    return res.status(400).json({ error: "參數錯誤" });
  }

  try {
    const checkSql = `SELECT reaction FROM discuss_fa WHERE member_id = ? AND dis_id = ?`;
    const [rows] = await db.query(checkSql, [memberId, dis_id]);

    if (rows.length > 0) {
      if (reaction === null) {
        const deleteSql = `DELETE FROM discuss_fa WHERE member_id = ? AND dis_id = ?`;
        await db.query(deleteSql, [memberId, dis_id]);
        return res.json({
          success: true,
          message: "取消按讚/倒讚",
          user_reaction: null,
        });
      } else if (rows[0].reaction === reaction) {
        const deleteSql = `DELETE FROM discuss_fa WHERE member_id = ? AND dis_id = ?`;
        await db.query(deleteSql, [memberId, dis_id]);
        return res.json({
          success: true,
          message: "取消按讚/倒讚",
          user_reaction: null,
        });
      } else {
        const updateSql = `UPDATE discuss_fa SET reaction = ? WHERE member_id = ? AND dis_id = ?`;
        await db.query(updateSql, [reaction, memberId, dis_id]);
        return res.json({
          success: true,
          message: "切換按讚/倒讚",
          user_reaction: reaction,
        });
      }
    } else {
      const insertSql = `INSERT INTO discuss_fa (member_id, dis_id, reaction) VALUES (?, ?, ?)`;
      await db.query(insertSql, [memberId, dis_id, reaction]);
      return res.json({
        success: true,
        message: "新增按讚/倒讚",
        user_reaction: reaction,
      });
    }
  } catch (error) {
    console.error("按讚發生錯誤:", error);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

export default router;
