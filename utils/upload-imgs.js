//將上傳圖檔的功能獨立出來
import multer from "multer";
import { v4 } from "uuid";

//設定可接收的副檔名
const extMap = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const fileFilter = (req, file, callback) => {
  callback(null, !!extMap[file.mimetype]);
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, `public/img`);
  },
  filename: (req, file, callback) => {
    const ext = extMap[file.mimetype];
    const f = v4() + ext;
    callback(null, f);
  },
});
export default multer({ fileFilter, storage });