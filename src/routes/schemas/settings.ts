// src/routes/schemas/settings.ts
import { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
  aiModerationEnabled: boolean;
  commentModerationEnabled: boolean;
  maxUploadSize: number; // Nuevo campo
}

const SettingsSchema = new Schema<ISettings>({
  aiModerationEnabled: { type: Boolean, default: true },
  commentModerationEnabled: { type: Boolean, default: true },
  maxUploadSize: { type: Number, default: 50 * 1024 * 1024 }, // Por defecto 50MB
});

export const SettingsModel = (mongoose: typeof import('mongoose')) =>
  mongoose.model<ISettings>('Settings', SettingsSchema);

