import mongoose, { Schema, Types, Document } from "mongoose";

export interface IApiKeyDocument extends Document {
  userId: Types.ObjectId;
  name: string;
  keyHash: string;
  prefix: string;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<IApiKeyDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    keyHash: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    lastUsedAt: Date,
    revokedAt: Date,
  },
  { timestamps: true },
);

export const ApiKey = mongoose.model<IApiKeyDocument>("ApiKey", apiKeySchema);
