// src/middlware/upload.ts

import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { FileFormatModel } from '../routes/schemas/fileFormat';
import mongoose from 'mongoose'; // Importa mongoose si no lo has hecho
import App from '../app'; // Importa tu clase App para obtener el cliente de Mongoose
import { SettingsModel } from '../routes/schemas/settings';


// Variable global para almacenar el maxUploadSize
export let maxUploadSize = 50 * 1024 * 1024; // 50MB por defecto

// Función para inicializar el maxUploadSize desde la base de datos
export const initUploadSettings = async (app: App) => {
  const mongooseClient = app.getClientMongoose();
  const Settings = SettingsModel(mongooseClient);

  const settings = await Settings.findOne().exec();
  if (settings && settings.maxUploadSize) {
    maxUploadSize = settings.maxUploadSize;
  }
};

// Configuración del almacenamiento con Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Carpeta donde se almacenarán los archivos
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Nombre del archivo con timestamp
  },
});

// Filtro de archivos dinámico
const fileFilter = async (req: Request, file: Express.Multer.File, cb: any) => {
  try {
    // Obtén el cliente de Mongoose desde la instancia de la aplicación
    const app = new App();
    const mongooseClient = app.getClientMongoose();

    const FileFormat = FileFormatModel(mongooseClient);

    // Obtén la lista de formatos habilitados desde la base de datos
    const allowedFormats = await FileFormat.find({ enabled: true }).exec();
    const allowedMimes = allowedFormats.map((format) => format.mimeType);

    // Verificar si el tipo de archivo es aceptado
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  } catch (error) {
    console.error('Error en fileFilter:', error);
    cb(new Error('Error al verificar el tipo de archivo'), false);
  }
};

// Inicializar Multer con un límite de tamaño mayor
// Función para obtener el middleware de subida con el tamaño actualizado
export const getUploadMiddleware = (maxSize: number) => {
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: maxSize },
  });
};
