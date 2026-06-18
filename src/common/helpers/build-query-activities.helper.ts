import { type Request } from 'express';
import { Types } from 'mongoose';

function parseObjectIdList(value: unknown): Types.ObjectId[] {
  if (!value) return [];

  return String(value)
    .split(',')
    .map((id) => id.trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export const buildQueryActivities = (req: Request) => {
  const pageDefault = 1;
  const pageSizeDefault = 20;
  const maxPageSize = 50;

  let page = Number(req.query.page) || pageDefault;
  let pageSize = Number(req.query.pageSize) || pageSizeDefault;

  if (page < 1) page = pageDefault;
  if (pageSize < 1) pageSize = pageSizeDefault;
  if (pageSize > maxPageSize) pageSize = maxPageSize;

  const skip = (page - 1) * pageSize;
  const limit = pageSize;

  const filter: Record<string, any> = {};

  /**
   * Filter by actorIds
   * Example: ?actorIds=id1,id2,id3
   */
  const actorIds = parseObjectIdList(req.query.actorIds);

  if (actorIds.length > 0) {
    filter.actorId = {
      $in: actorIds,
    };
  }

  /**
   * Filter by actionIds
   * Example: ?actionIds=id1,id2,id3
   */
  const actionIds = parseObjectIdList(req.query.actionIds);

  if (actionIds.length > 0) {
    filter.actionId = {
      $in: actionIds,
    };
  }

  /**
   * Filter by created_at range
   * Example: ?createdFrom=2026-06-01&createdTo=2026-06-17
   */
  const createdFrom = parseDate(req.query.createdFrom);
  const createdTo = parseDate(req.query.createdTo);

  const createdAtFilter: Record<string, Date> = {};

  if (createdFrom) {
    createdAtFilter.$gte = createdFrom;
  }

  if (createdTo) {
    createdAtFilter.$lte = createdTo;
  }

  if (Object.keys(createdAtFilter).length > 0) {
    filter.created_at = createdAtFilter;
  }

  /**
   * Default sort: newest activity first
   */
  const sort = {
    created_at: -1 as const,
  };

  return {
    page,
    pageSize,
    skip,
    limit,
    filter,
    sort,
  };
};
