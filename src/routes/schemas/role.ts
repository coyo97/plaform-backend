import mongoose, { Schema, Document, Mongoose } from 'mongoose';

// Interfaz para definir un permiso individual
export interface IPermission {
  name: string;      // Nombre del permiso, e.g., 'assign_roles'
  description: string; // Descripción del permiso
}

// Interfaz para definir un rol
export interface IRole extends Document {
  name: string;                // Nombre del rol, e.g., 'admin'
  description: string;         // Descripción del rol
  permissions: IPermission[];  // Lista de permisos asociados al rol
}

// Esquema de Permiso
const permissionSchema: Schema<IPermission> = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true }
});

// Esquema de Rol
const roleSchema: Schema<IRole> = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  permissions: [permissionSchema] // Relaciona los permisos al rol
});

// Exporta el modelo de Rol
export const RoleModel = (mongoose: Mongoose) => {
  return mongoose.model<IRole>('Role', roleSchema);
};

