import mongoose, { Schema, Document, Mongoose } from "mongoose";
import { IRole } from "./role";
import { ICareer } from "./career"; // Importa el modelo de carrera

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    username: string;
    email: string;
    password: string;
    roles: IRole[];
    careers: ICareer['_id'][]; // Campo para almacenar las carreras seleccionadas
}

const userSchema: Schema<IUser> = new Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    careers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Career' }], // Campo para carreras
});

userSchema.virtual('profile', {
    ref: 'Profile',
    localField: '_id',
    foreignField: 'user',
    justOne: true,
});

userSchema.set('toObject', { virtuals: true });
userSchema.set('toJSON', { virtuals: true });

export const UserModel = (mongoose: Mongoose) => {
    return mongoose.model<IUser>("User", userSchema);
};

