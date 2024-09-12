//// upload.ts
import multer from 'multer';
import path from 'path';

// Configuración del almacenamiento con Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Carpeta donde se almacenarán los archivos
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Nombre del archivo con timestamp
  },
});

// Filtros de archivos (opcional)
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  // Lista de tipos MIME aceptados
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword', // DOC
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.ms-excel', // XLS
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'text/plain', // TXT
    'video/mp4',
    'video/x-msvideo', // AVI
    'video/x-ms-wmv', // WMV
    'video/mpeg', // MPEG
    'video/quicktime', // MOV
    'application/zip', // ZIP
    'application/x-rar-compressed', // RAR
    'application/octet-stream', // Otros archivos binarios
  ];

  // Verificar si el tipo de archivo es aceptado
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido'), false);
  }
};

// Inicializar Multer con un límite de tamaño mayor
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // Aumenta el límite de tamaño de archivo a 50MB
});

