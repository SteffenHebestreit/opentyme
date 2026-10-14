import { Bot, Mail, Plug, type LucideIcon } from 'lucide-react';
import type { ApiTokenCapability } from '../../../api/types';

/** Icon per token feature, shared by the token form and the token list. */
export const CAPABILITY_ICONS: Record<ApiTokenCapability, LucideIcon> = {
  assistant: Bot,
  mcp: Plug,
  email_send: Mail,
};
