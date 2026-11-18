import mongoose from "mongoose";
import type { AuthUser } from "../../types/express.d.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  escapeRegex,
  paginate,
  type PaginateResult,
} from "../../utils/paginate.js";
import { Counter } from "./counter.model.js";
import { type IReceipt, Receipt } from "./receipt.model.js";
import { type Gender, type IPatient, Patient } from "./patient.model.js";
import type {
  CreatePatientInput,
  ListPatientsQuery,
  UpdatePatientInput,
} from "./patient.validation.js";

export interface PatientListItem {
  id: string;
  patientCode: string;
  name: string;
  phone: string;
  gender: Gender;
  dateOfBirth: Date;
  address?: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface PatientResponse {
  id: string;
  patientCode: string;
  name: string;
  phone: string;
  gender: Gender;
  dateOfBirth: Date;
  address?: string | null;
  isActive: boolean;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  receipt?: ReceiptResponse;
}

export interface ReceiptResponse {
  id: string;
  patientId: string;
  receiptNumber: string;
  items: { name: string; price: number }[];
  totalAmount: number;
  createdAt: Date;
}

const CODE_PAD_LENGTH = 4;
const PRICE_DECIMALS = 2;

function toReceiptResponse(
  receipt: Pick<
    IReceipt,
    "_id" | "patientId" | "receiptNumber" | "items" | "totalAmount" | "createdAt"
  >
): ReceiptResponse {
  return {
    id: receipt._id.toString(),
    patientId: receipt.patientId.toString(),
    receiptNumber: receipt.receiptNumber,
    items: receipt.items.map(({ name, price }) => ({ name, price })),
    totalAmount: receipt.totalAmount,
    createdAt: receipt.createdAt,
  };
}

/**
 * Service handling Patient management operations:
 * registration with atomic patientCode generation, list with search/filters,
 * details retrieval, updates, and soft deletion.
 */
export class PatientService {
  /**
   * Atomically increments a per-tenant counter and formats it as PREFIX-0001.
   */
  private static async nextCode(
    tenantId: mongoose.Types.ObjectId,
    key: string,
    prefix: string
  ): Promise<string> {
    const counter = await Counter.findOneAndUpdate(
      { tenantId, key },
      { $inc: { seq: 1 }, $setOnInsert: { tenantId, key } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return `${prefix}-${String(counter.seq).padStart(CODE_PAD_LENGTH, "0")}`;
  }
  /**
   * Registers a new patient with an atomic per-tenant sequence code (PT-0001 format).
   */
  static async createPatient(
    input: CreatePatientInput,
    currentUser: AuthUser
  ): Promise<PatientResponse> {
    if (!currentUser.tenantId) {
      throw ApiError.forbidden("User is not assigned to any laboratory");
    }

    const tenantId = new mongoose.Types.ObjectId(currentUser.tenantId);

    const patientCode = await PatientService.nextCode(
      tenantId,
      "patientCode",
      "PT"
    );

    const patient = await Patient.create({
      tenantId,
      patientCode,
      name: input.name.trim(),
      phone: input.phone.trim(),
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
      address: input.address?.trim() || null,
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(currentUser.id),
      updatedBy: new mongoose.Types.ObjectId(currentUser.id),
    });

    // Tests selected at registration produce a receipt for this patient
    let receipt: IReceipt | null = null;
    if (input.tests?.length) {
      const receiptNumber = await PatientService.nextCode(
        tenantId,
        "receiptNumber",
        "RCP"
      );
      const total = input.tests.reduce((sum, test) => sum + test.price, 0);

      receipt = await Receipt.create({
        tenantId,
        patientId: patient._id,
        receiptNumber,
        items: input.tests.map((test) => ({
          name: test.name.trim(),
          price: test.price,
        })),
        totalAmount: Number(total.toFixed(PRICE_DECIMALS)),
        createdBy: new mongoose.Types.ObjectId(currentUser.id),
      });
    }

    return {
      id: patient._id.toString(),
      patientCode: patient.patientCode,
      name: patient.name,
      phone: patient.phone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      address: patient.address,
      isActive: patient.isActive,
      createdBy: patient.createdBy ? patient.createdBy.toString() : null,
      updatedBy: patient.updatedBy ? patient.updatedBy.toString() : null,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
      ...(receipt ? { receipt: toReceiptResponse(receipt) } : {}),
    };
  }

  /**
   * Lists active patients with pagination, search on name, patientCode, or phone,
   * gender filter, and sorting.
   */
  static async listPatients(
    query: ListPatientsQuery,
    currentUser: AuthUser
  ): Promise<PaginateResult<PatientListItem>> {
    const filter: Record<string, unknown> = {
      isActive: true, // Soft delete exclusion: lists only return active patients
    };

    if (currentUser.isSuperAdmin) {
      if (currentUser.tenantId) {
        filter.tenantId = new mongoose.Types.ObjectId(currentUser.tenantId);
      }
    } else {
      if (!currentUser.tenantId) {
        throw ApiError.forbidden("User is not assigned to any laboratory");
      }
      filter.tenantId = new mongoose.Types.ObjectId(currentUser.tenantId);
    }

    // Case-insensitive substring search on name, patientCode, or phone
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      const escaped = escapeRegex(term);
      const isDigitsOrPhone = /^[+\d\s\-()]+$/.test(term);

      const branches: Array<Record<string, unknown>> = [
        { name: new RegExp(escaped, "i") },
        { patientCode: new RegExp(escaped, "i") },
      ];

      if (isDigitsOrPhone) {
        branches.push({ phone: new RegExp(escaped, "i") });
      }

      if (branches.length === 1) {
        Object.assign(filter, branches[0]);
      } else if (branches.length > 1) {
        filter.$or = branches;
      }
    }

    if (query.gender) {
      filter.gender = query.gender;
    }

    const sort = query.sort || "-createdAt";

    const paginatedResult = await paginate<IPatient>(Patient, filter, {
      page: query.page,
      limit: query.limit,
      sort,
    });

    const formattedData: PatientListItem[] = paginatedResult.data.map((p) => ({
      id: p._id.toString(),
      patientCode: p.patientCode,
      name: p.name,
      phone: p.phone,
      gender: p.gender,
      dateOfBirth: p.dateOfBirth,
      address: p.address ?? null,
      isActive: p.isActive ?? true,
      createdAt: p.createdAt,
    }));

    return {
      data: formattedData,
      meta: paginatedResult.meta,
    };
  }

  /**
   * Retrieves single patient by ID respecting tenant isolation.
   */
  static async getPatient(
    id: string,
    currentUser: AuthUser
  ): Promise<PatientResponse> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.notFound("Patient not found");
    }

    const patient = await Patient.findById(id).lean();
    if (!patient) {
      throw ApiError.notFound("Patient not found");
    }

    if (
      !currentUser.isSuperAdmin &&
      (!patient.tenantId ||
        patient.tenantId.toString() !== currentUser.tenantId)
    ) {
      throw ApiError.notFound("Patient not found");
    }

    return {
      id: patient._id.toString(),
      patientCode: patient.patientCode,
      name: patient.name,
      phone: patient.phone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      address: patient.address,
      isActive: patient.isActive,
      createdBy: patient.createdBy ? patient.createdBy.toString() : null,
      updatedBy: patient.updatedBy ? patient.updatedBy.toString() : null,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
  }

  /**
   * Updates patient details and records updatedBy user ID.
   */
  static async updatePatient(
    id: string,
    input: UpdatePatientInput,
    currentUser: AuthUser
  ): Promise<PatientResponse> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.notFound("Patient not found");
    }

    const patient = await Patient.findById(id);
    if (!patient) {
      throw ApiError.notFound("Patient not found");
    }

    if (
      !currentUser.isSuperAdmin &&
      (!patient.tenantId ||
        patient.tenantId.toString() !== currentUser.tenantId)
    ) {
      throw ApiError.notFound("Patient not found");
    }

    if (input.name !== undefined) {
      patient.name = input.name.trim();
    }
    if (input.phone !== undefined) {
      patient.phone = input.phone.trim();
    }
    if (input.gender !== undefined) {
      patient.gender = input.gender;
    }
    if (input.dateOfBirth !== undefined) {
      patient.dateOfBirth = input.dateOfBirth;
    }
    if (input.address !== undefined) {
      patient.address = input.address.trim() || null;
    }

    patient.updatedBy = new mongoose.Types.ObjectId(currentUser.id);
    await patient.save();

    return {
      id: patient._id.toString(),
      patientCode: patient.patientCode,
      name: patient.name,
      phone: patient.phone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      address: patient.address,
      isActive: patient.isActive,
      createdBy: patient.createdBy ? patient.createdBy.toString() : null,
      updatedBy: patient.updatedBy ? patient.updatedBy.toString() : null,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
  }

  /**
   * Lists receipts issued for a patient, newest first, respecting tenant isolation.
   */
  static async listReceipts(
    id: string,
    currentUser: AuthUser
  ): Promise<ReceiptResponse[]> {
    const patient = await PatientService.getPatient(id, currentUser);

    const receipts = await Receipt.find({ patientId: patient.id })
      .sort({ createdAt: -1 })
      .lean();

    return receipts.map(toReceiptResponse);
  }

  /**
   * Soft deletes a patient (isActive: false) and records updatedBy user ID.
   */
  static async deletePatient(
    id: string,
    currentUser: AuthUser
  ): Promise<PatientResponse> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.notFound("Patient not found");
    }

    const patient = await Patient.findById(id);
    if (!patient) {
      throw ApiError.notFound("Patient not found");
    }

    if (
      !currentUser.isSuperAdmin &&
      (!patient.tenantId ||
        patient.tenantId.toString() !== currentUser.tenantId)
    ) {
      throw ApiError.notFound("Patient not found");
    }

    patient.isActive = false;
    patient.updatedBy = new mongoose.Types.ObjectId(currentUser.id);
    await patient.save();

    return {
      id: patient._id.toString(),
      patientCode: patient.patientCode,
      name: patient.name,
      phone: patient.phone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      address: patient.address,
      isActive: patient.isActive,
      createdBy: patient.createdBy ? patient.createdBy.toString() : null,
      updatedBy: patient.updatedBy ? patient.updatedBy.toString() : null,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
  }
}
