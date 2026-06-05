import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY = 'PERMISSION_KEY';
export const Permissions = (action: string, resource: string) => SetMetadata(PERMISSION_KEY, [action, resource])