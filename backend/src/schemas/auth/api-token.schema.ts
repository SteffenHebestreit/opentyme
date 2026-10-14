import Joi from 'joi';
import {
  APPROVAL_MODES,
  CAPABILITY_KEYS,
  RESOURCE_KEYS,
  levelsFor,
} from '../../services/auth/api-token-permissions';

/**
 * Permissions as the catalog allows them: known resources at levels they
 * support (reports can't be written), known capabilities once each.
 * Unknown keys are rejected rather than ignored, so a typo is never a silent
 * "no access".
 */
const permissionsSchema = Joi.object({
  resources: Joi.object(
    Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Joi.string().valid(...levelsFor(key))]))
  ).default({}),
  capabilities: Joi.array()
    .items(Joi.string().valid(...CAPABILITY_KEYS))
    .unique()
    .default([]),
});

const name = Joi.string().trim().min(1).max(100).messages({
  'string.empty': 'Token name is required',
  'string.max': 'Token name must not exceed 100 characters',
});

const description = Joi.string().trim().max(500).allow('', null);

/** A future date, or null for a token that never expires — always an explicit choice. */
const expiresAt = Joi.date().iso().greater('now').allow(null).required().messages({
  'date.greater': 'Expiry date must be in the future',
  'any.required': 'expires_at is required (use null for a token that never expires)',
});

export const createApiTokenSchema = Joi.object({
  name: name.required(),
  description,
  permissions: permissionsSchema.required(),
  approval_mode: Joi.string().valid(...APPROVAL_MODES).default('self'),
  expires_at: expiresAt,
});

/** Expiry is not editable here — regenerate to change it. */
export const updateApiTokenSchema = Joi.object({
  name,
  description,
  permissions: permissionsSchema,
  approval_mode: Joi.string().valid(...APPROVAL_MODES),
}).min(1);

export const regenerateApiTokenSchema = Joi.object({
  expires_at: expiresAt,
});

export const apiTokenIdSchema = Joi.string().uuid().required();
