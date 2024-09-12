import mongoose, { Schema, Document, Mongoose } from "mongoose";
import { IUser } from "./user"; // Asegúrate de ajustar la ruta si es necesario

// Interfaz para definir la estructura de una publicación
export interface IPublication extends Document {
	title: string;
	content: string;
	author: IUser['_id']; // Referencia al usuario autor de la publicación
	tags: string[];
	created_at: Date;
	filePath?: string; // Ruta del archivo
	fileType?: string; // Tipo de archivo (imagen, pdf, video, etc.)
}

// Definición del esquema de publicación con Mongoose
const publicationSchema: Schema<IPublication> = new Schema({
	title: { type: String, required: true },
	content: { type: String, required: true },
	author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	tags: [{ type: String }],
	created_at: { type: Date, default: Date.now },
	filePath: { type: String }, // Nuevo campo para la ruta del archivo
	fileType: { type: String }, // Nuevo campo para el tipo de archivo
});

// Exporta el modelo de publicación
export const PublicationModel = (mongoose: Mongoose) => {
	return mongoose.model<IPublication>("Publication", publicationSchema);
};

