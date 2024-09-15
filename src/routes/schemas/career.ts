import mongoose, { Schema, Document, Mongoose } from 'mongoose';

export interface ICareer extends Document {
  name: string;
  description?: string;
}

const careerSchema: Schema<ICareer> = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
});

export const CareerModel= (mongoose: Mongoose) => {
    return mongoose.model<ICareer>('Career', careerSchema);
};

