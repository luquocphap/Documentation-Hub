import { DocumentCommentStatus } from '../schemas/document-comments.schema';

export interface RealtimeCommentOwner {
  id: string;
  fullName: string;
}

export interface RealtimeDocumentAnnotation {
  _id: string;
  documentId: string;
  annotationId: string;
  type: string;
  pageNumber: number;
  quads: Record<string, unknown>[];
  rect: Record<string, unknown> | null;
  contents: string;
  color: string;
  opacity: number;
  xfdf: string | null;
  owner: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentCommentRealtimePayload {
  _id: string;
  documentId: string;
  text: string;
  selectedText: string | null;
  pageNumber: number;
  status: DocumentCommentStatus;
  replyCount: number;
  annotationRef: RealtimeDocumentAnnotation | string | null;
  annotationId: string | null;
  owner: RealtimeCommentOwner;
  created_at: string;
  updated_at: string;
  isUpdated: boolean;
}

export interface CommentDeletedPayload {
  documentId: string;
  commentId: string;
  annotationId: string | null;
}

export interface ReplySummaryPayload {
  documentId: string;
  commentId: string;
  replyCount: number;
}
