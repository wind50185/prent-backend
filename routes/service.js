import express from "express";
import db from "../utils/connect-mysql.js";

const router = express.Router();

// ---------- 取得首頁專家卡片資料的函式 GET "/api" ----------
const getHomeData = async (req) => {
  const m_id = +req.params.m_id || 0;

  let allCategory = [];
  const sqlAll = `SELECT pro_data.member_id, pro_name, pro_star, pro_banner_url, service_price_main FROM pro_data
      LEFT JOIN p_member
      ON pro_data.member_id = p_member.member_id
      LEFT JOIN service
      ON p_member.member_id = service.member_id
      WHERE pro_data.member_id <> ?
      ORDER BY rand()
      LIMIT 8;`;
  [allCategory] = await db.query(sqlAll, m_id);

  let category1 = [];
  const sql1 = `SELECT pro_data.member_id, pro_name, pro_star, pro_banner_url, service_price_main FROM pro_data
      LEFT JOIN p_member
      ON pro_data.member_id = p_member.member_id
      LEFT JOIN service
      ON p_member.member_id = service.member_id
      WHERE service.service_category_id = 1
      ORDER BY rand()
      LIMIT 8;`;
  [category1] = await db.query(sql1);

  let category2 = [];
  const sql2 = `SELECT pro_data.member_id, pro_name, pro_star, pro_banner_url, service_price_main FROM pro_data
      LEFT JOIN p_member
      ON pro_data.member_id = p_member.member_id
      LEFT JOIN service
      ON p_member.member_id = service.member_id
      WHERE service.service_category_id = 2
      ORDER BY rand()
      LIMIT 8;`;
  [category2] = await db.query(sql2);

  let category3 = [];
  const sql3 = `SELECT pro_data.member_id, pro_name, pro_star, pro_banner_url, service_price_main FROM pro_data
      LEFT JOIN p_member
      ON pro_data.member_id = p_member.member_id
      LEFT JOIN service
      ON p_member.member_id = service.member_id
      WHERE service.service_category_id = 3
      ORDER BY rand()
      LIMIT 8;`;
  [category3] = await db.query(sql3);

  return { allCategory, category1, category2, category3 };
};

// ---------- 取得列表資料的函式 GET "/pro/api" ----------
const getListData = async (req) => {
  let page = parseInt(req.query.page) || 1;
  if (page < 1) {
    return { redirect: `?page=1` };
  }
  const perPage = 5; // 每頁筆數

  let rawKeyword = req.query.keyword || "";
  let keyword = rawKeyword.trim();

  let minRating = parseInt(req.query.minRating) || 1;
  let maxRating = parseInt(req.query.maxRating) || 5;

  let minPrice = parseInt(req.query.minPrice) || 0;
  let maxPrice = parseInt(req.query.maxPrice) || 5000;

  let category = req.query.category
    ? Array.isArray(req.query.category)
      ? req.query.category
      : [req.query.category]
    : [1, 2, 3];

  let sortBy = req.query.sortBy || "default";

  let t_sql = `SELECT COUNT(*) totalRows 
                FROM (
                  SELECT pro_data.member_id
                  FROM pro_data
                  LEFT JOIN p_member ON pro_data.member_id = p_member.member_id
                  LEFT JOIN service ON p_member.member_id = service.member_id
                  WHERE 1 `; // 查詢資料總筆數

  const params = [];

  if (minPrice !== 0 || maxPrice !== 5000) {
    params.push(minPrice, maxPrice);
    t_sql += " AND service_price_main BETWEEN ? AND ? ";
  }

  if (minRating && maxRating) {
    params.push(minRating, maxRating);
    t_sql += " AND pro_star BETWEEN ? AND ? ";
  }

  if (category && category.length > 0) {
    const placeholders = category.map(() => "?").join(", ");
    params.push(...category);
    t_sql += ` AND service_category_id IN (${placeholders}) `;
  }

  if (keyword) {
    keyword = `%${keyword}%`; // 加入模糊搜尋符號
    params.push(keyword);
    t_sql += " AND pro_name LIKE ? ";
  }

  t_sql += ` GROUP BY pro_data.member_id ) t `;

  const [[{ totalRows }]] = await db.query(t_sql, params);
  const totalPages = Math.ceil(totalRows / perPage);

  let rows = [];
  let rows2 = [];

  if (totalRows) {
    if (page > totalPages) {
      return { redirect: `?page=${totalPages}` };
    }
    let sql = `SELECT 
                t.member_id,
                ANY_VALUE(t.pro_name) AS pro_name,
                ANY_VALUE(t.pro_intro) AS pro_intro,
                ANY_VALUE(t.pro_star) AS pro_star,
                ANY_VALUE(t.pro_banner_url) AS pro_banner_url,
                JSON_ARRAYAGG(
                  JSON_OBJECT(
                    'service_category_id', t.service_category_id,
                    'service_price_main', t.service_price_main
                  )
                ) AS services
              FROM (
                SELECT 
                  pro_data.member_id,
                  pro_name,
                  pro_intro,
                  pro_star,
                  pro_banner_url,
                  service_category_id,
                  service_price_main
                FROM pro_data
                LEFT JOIN p_member ON pro_data.member_id = p_member.member_id
                LEFT JOIN service ON p_member.member_id = service.member_id
                WHERE 1
              `;

    const params = [];

    if (minPrice !== 0 || maxPrice !== 5000) {
      params.push(minPrice, maxPrice);
      sql += " AND service_price_main BETWEEN ? AND ? ";
    }

    if (minRating && maxRating) {
      params.push(minRating, maxRating);
      sql += " AND pro_star BETWEEN ? AND ? ";
    }

    if (category && category.length > 0) {
      const placeholders = category.map(() => "?").join(", ");
      params.push(...category);
      sql += ` AND service_category_id IN (${placeholders}) `;
    }

    if (keyword) {
      keyword = `%${keyword}%`;
      params.push(keyword);
      sql += " AND pro_name LIKE ? ";
    }

    sql += ` ) AS t
            GROUP BY t.member_id `;

    if (sortBy) {
      switch (sortBy) {
        case "price_asc":
          sql += ` ORDER BY MIN(t.service_price_main) `;
          break;
        case "price_desc":
          sql += ` ORDER BY MIN(t.service_price_main) DESC `;
          break;
        case "rating_asc":
          sql += ` ORDER BY pro_star `;
          break;
        case "rating_desc":
          sql += ` ORDER BY pro_star DESC `;
          break;
        default:
          sql += ` ORDER BY t.member_id `;
      }
    }

    sql += ` LIMIT ${perPage * (page - 1)}, ${perPage} `;

    [rows] = await db.query(sql, params);

    const member_ids = new Set();
    rows.forEach((i) => member_ids.add(i.member_id));

    const sql2 = `SELECT 
                    pro_data.member_id,
                    service_category_id,
                    service_price_main
                  FROM pro_data
                  JOIN service ON pro_data.member_id = service.member_id
                  WHERE pro_data.member_id IN (${[...member_ids.keys()].join(
                    ","
                  )})`;
    [rows2] = await db.query(sql2);
  }
  return { perPage, page, totalPages, totalRows, rows, rows2 };
};

// ---------- 取得單個專家資料的函式 GET "/pro/api/:m_id" ----------
// 取得專家基本資料
const getDetailData = async (req, res) => {
  const output = {
    success: false,
    error: "",
    proData: {},
    category1Data: {},
    category2Data: {},
    category3Data: {},
    serviceSupply: {},
    proCardData: {},
  };
  const m_id = +req.params.m_id; // 轉換成數值
  if (!m_id) {
    output.error = "編號錯誤";
    return res.json(output);
  }

  // 專家基本資料
  const sqlData = `SELECT pro_data.member_id, pro_name, pro_intro, pro_star, pro_banner_url, member_name, img, phone FROM pro_data
                    LEFT JOIN p_member
                    ON pro_data.member_id = p_member.member_id
                    LEFT JOIN service
                    ON p_member.member_id = service.member_id
                    WHERE pro_data.member_id = ?
                    LIMIT 1`;
  const [proData] = await db.query(sqlData, m_id);

  // 專家搬家清運資料
  const sql1 = `SELECT pro_data.member_id, service.service_id, service_category_id, service_intro, 
                service_price_main, service_price_extra, service_img_url FROM pro_data 
                LEFT JOIN p_member
                ON pro_data.member_id = p_member.member_id
                LEFT JOIN service
                ON p_member.member_id = service.member_id
                LEFT JOIN service_img
                ON service.service_id = service_img.service_id
                WHERE pro_data.member_id = ?
                AND service_category_id = 1;`;
  const [category1Data] = await db.query(sql1, m_id);

  // 專家清潔消毒資料
  const sql2 = `SELECT pro_data.member_id, service.service_id, service_category_id, service_intro, 
                service_price_main, service_price_extra, service_img_url FROM pro_data 
                LEFT JOIN p_member
                ON pro_data.member_id = p_member.member_id
                LEFT JOIN service
                ON p_member.member_id = service.member_id
                LEFT JOIN service_img
                ON service.service_id = service_img.service_id
                WHERE pro_data.member_id = ?
                AND service_category_id = 2;`;
  const [category2Data] = await db.query(sql2, m_id);

  // 專家水電修繕資料
  const sql3 = `SELECT pro_data.member_id, service.service_id, service_category_id, service_intro, 
                service_price_main, service_price_extra, service_img_url FROM pro_data 
                LEFT JOIN p_member
                ON pro_data.member_id = p_member.member_id
                LEFT JOIN service
                ON p_member.member_id = service.member_id
                LEFT JOIN service_img
                ON service.service_id = service_img.service_id
                WHERE pro_data.member_id = ?
                AND service_category_id = 3;`;
  const [category3Data] = await db.query(sql3, m_id);

  // 提供服務的時間和日期
  const sqlSupply = `SELECT member_id, service_category_id, supply_date, service_time.service_time_id,
                      service_time_content, service_amount from service
                      LEFT JOIN service_supply 
                      ON service.service_id = service_supply.service_id
                      LEFT JOIN service_time
                      ON service_supply.service_time_id = service_time.service_time_id
                      WHERE member_id = ?
                      ORDER BY service_time.service_time_id;`;
  const [serviceSupply] = await db.query(sqlSupply, m_id);

  // 底下的瀏覽更多專家
  const sqlProCardData = `SELECT pro_data.member_id,
                            ANY_VALUE(pro_name) AS pro_name,
                            ANY_VALUE(pro_star) AS pro_star,
                            ANY_VALUE(pro_banner_url) AS pro_banner_url,
                            MIN(service_price_main) AS service_price_main
                          FROM pro_data
                            LEFT JOIN p_member ON pro_data.member_id = p_member.member_id
                            LEFT JOIN service ON p_member.member_id = service.member_id
                          WHERE pro_data.member_id <> ?
                          GROUP BY pro_data.member_id
                          ORDER BY rand()
                          LIMIT 8;`;
  const [proCardData] = await db.query(sqlProCardData, m_id);

  output.success = true;
  output.proData = proData[0];
  output.category1Data = category1Data;
  output.category2Data = category2Data;
  output.category3Data = category3Data;
  output.serviceSupply = serviceSupply;
  output.proCardData = proCardData;
  return res.json(output);
};

// ---------- 新增預約資料的函式 POST "/pro/api/:m_id/booking" ----------
const addBookingData = async (req, res) => {
  const output = {
    success: false,
    bodyData: req.body,
    errors: [],
  };
  const { service_id, member_id, date, time } = req.body;
  const sql1 =
    "INSERT INTO service_booking (service_id, member_id, booking_date, service_time) VALUES (?, ?, ?, ?)";
  const [result1] = await db.query(sql1, [service_id, member_id, date, time]);

  const sql2 = `UPDATE service_supply 
                SET service_amount = 0
                WHERE service_id = ?
                AND supply_date = ?
                AND service_time_id = ?;`;
  const [result2] = await db.query(sql2, [service_id, date, time]);

  output.result1 = result1;
  output.result2 = result2;

  output.success = !!result1.affectedRows && !!result2.affectedRows;

  res.json(output);
};

// ---------- 我的預約資料的函式 POST "/pro/api/booking" ----------
const myBookingData = async (req, res) => {
  const output = {
    success: false,
    error: "",
    rows: [],
  };
  const m_id = req.my_jwt?.id || 0;

  if (!m_id) {
    output.error = "編號錯誤";
    return res.json(output);
  }
  const sql = `SELECT service_booking_id, service_booking.service_id, service_booking.member_id,
                booking_date, service_time_content, service.service_category_id, service_category_name, pro_data.member_id pro_mid,
                pro_name, pro_banner_url from service_booking
                  JOIN service_time ON service_time = service_time_id
                  JOIN service ON service_booking.service_id = service.service_id
                  JOIN service_category ON service.service_category_id = service_category.service_category_id
                  JOIN pro_data ON service.member_id = pro_data.member_id
                WHERE service_booking.member_id = ?
                ORDER BY booking_date;`;
  const [rows] = await db.query(sql, m_id);
  output.success = true;
  output.rows = rows;
  return res.json(output);
};

// ---------- 使用函式 ----------
// 服務首頁 api - GET
router.get("/api", async (req, res) => {
  res.json(await getHomeData(req));
});

// 專家列表 api - GET
router.get("/pro/api", async (req, res) => {
  res.json(await getListData(req));
});

// 拿單筆資料 api - GET
router.get("/pro/api/:m_id", getDetailData);

// 送出預約資料 api - POST
router.post("/pro/api/:m_id/booking", addBookingData);

// 我的預約資料 api - GET
router.get("/my_booking/api", myBookingData);

export default router;
