import mongoose, { type Document, type Model, Schema } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin.js";

export interface IReceiptItem {
  name: string;
  price: number;
}

export interface IReceipt extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  patientId: mongoose.Types.ObjectId;
  receiptNumber: string;
  items: IReceiptItem[];
  totalAmount: number;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReceiptItemSchema = new Schema<IReceiptItem>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const ReceiptSchema = new Schema<IReceipt>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    receiptNumber: {
      type: String,
      required: true,
      trim: true,
    },
    items: {
      type: [ReceiptItemSchema],
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Apply tenant plugin
ReceiptSchema.plugin(tenantPlugin);

ReceiptSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true });
ReceiptSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });

export const Receipt: Model<IReceipt> =
  mongoose.models.Receipt ||
  mongoose.model<IReceipt>("Receipt", ReceiptSchema);