// src/routes/schemas/publication.ts
import mongoose, { Schema, Document, Mongoose, Types } from 'mongoose';
import { IUser } from './user';
import { ICareer } from './career';

export interface IPublication extends Document {
  title: string;
  content: string;
  author: IUser['_id'];
  tags: string[];
  created_at: Date;
  filePath?: string;
  fileType?: string;
  career: ICareer['_id']; // Nuevo campo para la carrera
  likes: Types.ObjectId[]; // Array de ObjectId
}

const publicationSchema: Schema<IPublication> = new Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tags: [{ type: String }],
  created_at: { type: Date, default: Date.now },
  filePath: { type: String },
  fileType: { type: String },
  career: { type: mongoose.Schema.Types.ObjectId, ref: 'Career', required: true }, // Campo obligatorio para la carrera
  likes: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
});

// Agregar índice de texto en los campos title, content y tags
publicationSchema.index({ title: 'text', content: 'text', tags: 'text' });


export const PublicationModel = (mongoose: Mongoose) => {
  return mongoose.model<IPublication>('Publication', publicationSchema);
};

