// src/routes/schemas/message.ts
import mongoose, { Schema, Document, Mongoose } from 'mongoose';
import { IUser } from './user';

export interface IMessage extends Document {
  sender: IUser['_id']; // Referencia al usuario que envió el mensaje
  receiver: IUser['_id']; // Referencia al usuario que recibe el mensaje
  content: string; // Contenido del mensaje
  createdAt: Date; // Fecha y hora de creación del mensaje
  isGroupMessage: boolean; // Indica si el mensaje es para un grupo
  groupId?: string; // ID del grupo (opcional, solo si el mensaje es para un grupo)
  isRead: boolean; // Nuevo campo para indicar si el mensaje ha sido leído
}

const messageSchema: Schema<IMessage> = new Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Opcional si es un mensaje grupal
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  isGroupMessage: { type: Boolean, default: false },
  groupId: { type: String }, // Opcional: solo para mensajes grupales
  isRead: { type: Boolean, default: false }, // Campo de visto
});

export const MessageModel = (mongoose: Mongoose) => {
  return mongoose.model<IMessage>('Message', messageSchema);
};

