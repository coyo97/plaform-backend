// src/routes/schemas/report.ts
import { Schema, Document } from 'mongoose';

export interface IReport extends Document {
  reporter: Schema.Types.ObjectId; // Usuario que realiza el reporte
  publication: Schema.Types.ObjectId; // Publicación reportada
  reason: string; // Razón del reporte
  status: 'pending' | 'reviewed' | 'dismissed'; // Estado del reporte
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publication: { type: Schema.Types.ObjectId, ref: 'Publication', required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending' },
  },
  { timestamps: true }
);

export const ReportModel = (mongoose: typeof import('mongoose')) =>
  mongoose.model<IReport>('Report', ReportSchema);

