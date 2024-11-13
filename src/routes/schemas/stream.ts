import { Schema, model, Document, Model } from 'mongoose';

export interface IStream extends Document {
    title: string;
    userId: string;
    streamKey: string;
    active: boolean;
	isScreenSharing: boolean;
}

const StreamSchema: Schema = new Schema({
    title: { type: String, required: true },
    userId: { type: String, required: true },
    streamKey: { type: String, required: true },
    active: { type: Boolean, default: true },
	isScreenSharing: { type: Boolean, default: false }, // Nuevo campo
});

export const StreamModel: Model<IStream> = model<IStream>('Stream', StreamSchema);

