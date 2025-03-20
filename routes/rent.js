import express from "express";
import db from "../utils/connect-mysql.js"; //SQL

const fmDate = "YYYY-MM-DD";
//for json
// import fs from "fs";
// import path from "path";

const router = express.Router();

//for SQL
/*
// 定義 API 路由來獲取資料
const getRentData = async (req) => {
  try {
    const sql = `SELECT pr.rent_id, pr.rent_name,pr.price, pr.create_time,
pr.address, pr.sqm, pr.floor, pr.pet,
pr.elevator, pr.description, pr.lng, pr.lat, pm.member_name, pm.phone, 
ri.rent_img_url, ri.rent_is_primary,
rc.area, rc.area_id, rt.building_type, rt.type_id FROM p_rent pr join p_member pm on
pm.member_id = pr.member_id join rent_img ri on ri.rent_id = pr.rent_id
join rent_city rc on pr.city = rc.area_id join rent_type rt on pr.building_type = rt.type_id where rent_is_primary;`;

    const [rows] = await db.query(sql);
    return rows;
  } catch (error) {
    console.error(error);
    throw new Error("資料庫錯誤");
  }
};

router.get("/api", async (req, res) => {
  try {
    const data = await getRentData(req);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "資料庫錯誤" });
  }
});
*/
router.get("/api", async (req, res) => {
  const {
    location,
    buildingType,
    pet,
    elevator,
    sortOrder,
    search,
    minPrice,
    maxPrice,
    minSqm,
    maxSqm,
    minFloor,
    maxFloor,
  } = req.query;

  let sql = `SELECT pr.rent_id, pr.rent_name, pr.price, pr.create_time,
pr.address, pr.sqm, pr.floor, pr.pet, pr.city, pr.building_type, 
pr.elevator, pr.description, pr.lng, pr.lat, pm.member_name, pm.phone, 
ri.rent_img_url, ri.rent_is_primary,
rc.area, rc.area_id, rt.building_type, rt.type_id FROM p_rent pr join p_member pm on
pm.member_id = pr.member_id join rent_img ri on ri.rent_id = pr.rent_id
join rent_city rc on pr.city = rc.area_id join rent_type rt on pr.building_type = rt.type_id where rent_is_primary = 1`;

  // 加入篩選條件
  const params = [];
  // if (location) {
  //   sql += ` AND pr.city = ?`;
  //   params.push(location);
  // } // 單選
  // 處理 location 參數，支援多選
  if (location) {
    const locationArray = location.split(","); // 分割選中的地區
    sql += ` AND pr.city IN (${locationArray.map(() => "?").join(",")})`; // 使用 IN 來處理多選
    params.push(...locationArray); // 把地區添加到查詢參數中
  }
  if (buildingType) {
    const buildingTypeArray = buildingType.split(","); // 分割選中的地區
    sql += ` AND pr.building_type IN (${buildingTypeArray
      .map(() => "?")
      .join(",")})`; // 使用 IN 來處理多選
    params.push(...buildingTypeArray); // 把地區添加到查詢參數中
  }
  if (pet) {
    sql += ` AND pr.pet = ?`;
    params.push(pet);
  }
  if (elevator) {
    sql += ` AND pr.elevator = ?`;
    params.push(elevator);
  }

  // 加入Range篩選條件
  if (minPrice) {
    sql += ` AND pr.price >= ?`;
    params.push(minPrice);
  }
  if (maxPrice) {
    sql += ` AND pr.price <= ?`;
    params.push(maxPrice);
  }

  if (minSqm) {
    sql += ` AND pr.Sqm >= ?`;
    params.push(minSqm);
  }
  if (maxSqm) {
    sql += ` AND pr.Sqm <= ?`;
    params.push(maxSqm);
  }

  if (minFloor) {
    sql += ` AND pr.Floor >= ?`;
    params.push(minFloor);
  }
  if (maxFloor) {
    sql += ` AND pr.Floor <= ?`;
    params.push(maxFloor);
  }

  if (search) {
    sql += ` AND pr.rent_name LIKE ?`;
    params.push(`%${search}%`); // 模糊搜尋
  }

  // 加入排序條件
  if (sortOrder) {
    if (sortOrder === "price_asc") {
      sql += ` ORDER BY pr.price ASC`;
    } else if (sortOrder === "sqm_desc") {
      sql += ` ORDER BY pr.sqm DESC`;
    } else if (sortOrder === "floor_asc") {
      sql += ` ORDER BY pr.floor ASC`;
    }
  }

  try {
    const [rows] = await db.query(sql, params); // 使用數據庫查詢
    res.json(rows); // 返回查詢結果
  } catch (err) {
    console.error("Error querying database:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//單筆詳情頁輪播資料
router.get("/images/api/:rent_id", async (req, res) => {
  const output = {
    success: false,
    error: "",
    data: {},
  };

  const rent_id = +req.params.rent_id; // 轉換成數值
  if (!rent_id) {
    output.error = "編號錯誤";
    return res.json(output);
  }
  const sql = `select ri.rent_id ri_id, rent_is_primary, ri.rent_img_url from rent_img ri join p_rent pr on ri.rent_id = pr.rent_id where ri.rent_id=${rent_id};`;

  const [rows] = await db.query(sql);
  if (!rows.length) {
    output.error = "沒有該筆資料";
    return res.json(output);
  }
  const row = rows;
  output.success = true;
  output.data = row;
  return res.json(output);
});

// 讀取單筆文案資料
router.get("/api/:rent_id", async (req, res) => {
  const output = {
    success: false,
    error: "",
    data: {},
  };

  const rent_id = +req.params.rent_id; // 轉換成數值
  if (!rent_id) {
    output.error = "編號錯誤";
    return res.json(output);
  }
  const sql = `SELECT pr.rent_id, pr.rent_name,pr.price, pr.create_time,
pr.address, pr.sqm, pr.floor, pr.pet,
pr.elevator, pr.description, pr.lng, pr.lat, pm.member_name, pm.phone, 
rc.area, rt.building_type FROM p_rent pr join p_member pm on
pm.member_id = pr.member_id 
join rent_city rc on pr.city = rc.area_id join rent_type rt on pr.building_type = rt.type_id where rent_id=${rent_id};`;

  const [rows] = await db.query(sql);
  if (!rows.length) {
    output.error = "沒有該筆資料";
    return res.json(output);
  }
  const row = rows[0];
  output.success = true;
  output.data = row;
  return res.json(output);
});
//for SQL

//for json
// const JSON_FILE_PATH = path.join(process.cwd(), "json", "rent.json"); // 指定 JSON 檔案路徑

// // 設定 API 來提供 JSON 檔案內容
// router.get("/api", (req, res) => {
//   try {
//     if (!fs.existsSync(JSON_FILE_PATH)) {
//       return res.status(404).json({ error: "JSON 檔案不存在" });
//     }

//     // 讀取 JSON 檔案並回傳
//     const data = fs.readFileSync(JSON_FILE_PATH, "utf-8");
//     res.setHeader("Content-Type", "application/json");
//     res.send(data);
//   } catch (error) {
//     res.status(500).json({ error: "讀取 JSON 檔案失敗" });
//   }
// });

export default router;
