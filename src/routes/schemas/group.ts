// src/routes/schemas/group.ts
import mongoose, { Schema, Document, Mongoose } from 'mongoose';
import { IUser } from './user';

export interface IGroup extends Document {
  name: string; // Nombre del grupo
  description?: string; // Descripción del grupo
  members: IUser['_id'][]; // Lista de miembros (usuarios)
  createdAt: Date; // Fecha de creación
  createdBy: IUser['_id']; // Usuario que creó el grupo
}

const groupSchema: Schema<IGroup> = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

export const GroupModel = (mongoose: Mongoose) => {
  return mongoose.model<IGroup>('Group', groupSchema);
};

