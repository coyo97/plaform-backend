import mongoose, { Schema, Document, Mongoose } from "mongoose";
import { IRole } from "./role";


// Interfaz de Usuario
export interface IUser extends Document {
	_id: mongoose.Types.ObjectId;
	username: string;
	email: string;
	password: string;
	roles: IRole[]; // Referencia la interfaz IRole
}

// Definición del Esquema de Usuario
const userSchema: Schema<IUser> = new Schema({
	username: { type: String, required: true },
	email: { type: String, required: true, unique: true },
	password: { type: String, required: true },
	roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }] // Referencia al modelo de Role
});

// Exporta el Modelo de Usuario
export const UserModel = (mongoose: Mongoose) => {
	return mongoose.model<IUser>("User", userSchema);
};

