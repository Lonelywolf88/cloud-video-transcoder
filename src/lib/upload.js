import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    // temp dir; we will move to final location after we know user/video ids
    cb(null, path.join(process.cwd(), "data", "tmp"));
  },
  filename: function (_req, file, cb) {
    const id = nanoid(8);
    const ext = path.extname(file.originalname || ".mp4") || ".mp4";
    cb(null, `${Date.now()}_${id}${ext}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB
});
