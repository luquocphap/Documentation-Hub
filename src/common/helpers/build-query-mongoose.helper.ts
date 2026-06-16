import { Request } from "express";
import { Types } from "mongoose";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseObjectIdList(value: unknown): Types.ObjectId[] {
  if (!value) return [];

  return String(value)
    .split(",")
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

export const buildQueryMongoose = (req: Request) => {
  const pageDefault = 1;
  const pageSizeDefault = 10;
  const maxPageSize = 50;

  let page = Number(req.query.page) || pageDefault;
  let pageSize = Number(req.query.pageSize) || pageSizeDefault;

  if (page < 1) page = pageDefault;
  if (pageSize < 1) pageSize = pageSizeDefault;
  if (pageSize > maxPageSize) pageSize = maxPageSize;

  const skip = (page - 1) * pageSize;
  const limit = pageSize;

  const filter: Record<string, any> = {
    isDeleted: false,
  };

  /**
   * Search title/content
   */
  const search = req.query.search;

  if (typeof search === "string" && search.trim()) {
    const keyword = escapeRegex(search.trim());

    filter.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { content: { $regex: keyword, $options: "i" } },
    ];
  }

  /**
   * Filter by workspaceIds
   * Example: ?workspaceIds=id1,id2,id3
   */
  const workspaceIds = parseObjectIdList(req.query.workspaceIds);

  if (workspaceIds.length > 0) {
    filter.workspaceId = {
      $in: workspaceIds,
    };
  }

  /**
   * Filter by updated_at range
   * Example: ?updatedFrom=2026-06-01&updatedTo=2026-06-16
   */
  const updatedFrom = parseDate(req.query.updatedFrom);
  const updatedTo = parseDate(req.query.updatedTo);

  const updatedAtFilter: Record<string, Date> = {};

  if (updatedFrom) {
    updatedAtFilter.$gte = updatedFrom;
  }

  if (updatedTo) {
    updatedAtFilter.$lte = updatedTo;
  }

  if (Object.keys(updatedAtFilter).length > 0) {
    filter.updated_at = updatedAtFilter;
  }

  /**
   * Default sort: recently updated first
   */
  const sort = {
    updated_at: -1 as const,
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