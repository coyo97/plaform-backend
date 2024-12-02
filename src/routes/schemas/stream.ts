import { Schema, model, Document, Model } from 'mongoose';

export interface IStream extends Document {
	title: string;
	userId: string;
	streamKey: string;
	active: boolean;
	isScreenSharing: boolean;
	career?: string;
	visibility: 'semester' | 'career' | 'university';
	semestersAllowed?: number[];
}

const StreamSchema: Schema = new Schema({
	title: { type: String, required: true },
	userId: { type: String, required: true },
	streamKey: { type: String, required: true },
	active: { type: Boolean, default: true },
	isScreenSharing: { type: Boolean, default: false }, // Nuevo campo
	career: { type: String, required: false }, // Campo opcional
	visibility: {
		type: String,
		enum: ['semester', 'career', 'university'],
		required: true
	},
	semestersAllowed: {
		type: [Number],
		required: false
	}, // Campo opcional para números
});

export const StreamModel: Model<IStream> = model<IStream>('Stream', StreamSchema);

