// src/routes/schemas/role.ts
import { Schema, model, Document } from 'mongoose';

export interface IRole extends Document {
  name: string;
  description?: string;
  permissions: IPermission[];
}

export interface IPermission {
  module: string;
  action: string;
  name: string;
  description: string;
}

const permissionSchema = new Schema<IPermission>({
  module: { type: String, required: true },
  action: { type: String, required: true },
  name: { type: String, required: true }, // Asegura que 'name' es requerido
  description: { type: String },
});


const roleSchema = new Schema<IRole>({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  permissions: [permissionSchema],
});

export const RoleModel = (mongoose: typeof import('mongoose')) => mongoose.model<IRole>('Role', roleSchema);

