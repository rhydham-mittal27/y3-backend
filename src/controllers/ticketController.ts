import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  createTicket,
  getMyTickets,
  getTicketsForStaff,
  getTicketById,
  addTicketComment,
  updateTicketStatus,
  getTicketStats,
} from '../services/ticketService';

/** POST /api/v1/tickets */
export const createTicketController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const userId = req.user!.id;
  const ticket = await createTicket(userId, req.body);
  return res.status(201).json(successResponse(ticket, `Ticket ${ticket.ticketNumber} created.`));
});

/** GET /api/v1/tickets/my */
export const getMyTicketsController = asyncHandler(async (req: AuthRequest, res) => {
  const tickets = await getMyTickets(req.user!.id);
  return res.json(successResponse(tickets));
});

/** GET /api/v1/tickets — coordinator/admin list */
export const listTicketsController = asyncHandler(async (req: AuthRequest, res) => {
  const page     = parseInt((req.query.page as string)  || '1', 10);
  const limit    = parseInt((req.query.limit as string) || '20', 10);
  const status   = (req.query.status as string)   || undefined;
  const priority = (req.query.priority as string) || undefined;

  const result = await getTicketsForStaff(req.user!.id, req.user!.role, { status, priority, page, limit });
  return res.json(paginatedResponse(result.tickets, result.page, result.limit, result.total));
});

/** GET /api/v1/tickets/stats */
export const ticketStatsController = asyncHandler(async (req: AuthRequest, res) => {
  const stats = await getTicketStats(req.user!.id, req.user!.role);
  return res.json(successResponse(stats));
});

/** GET /api/v1/tickets/:id */
export const getTicketController = asyncHandler(async (req: AuthRequest, res) => {
  const ticket = await getTicketById(req.params.id, req.user!.id, req.user!.role);
  return res.json(successResponse(ticket));
});

/** POST /api/v1/tickets/:id/comments */
export const addCommentController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const ticket = await addTicketComment(req.params.id, req.user!.id, req.user!.role, req.body.message);
  return res.json(successResponse(ticket, 'Comment added.'));
});

/** PATCH /api/v1/tickets/:id/status */
export const updateStatusController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const ticket = await updateTicketStatus(req.params.id, req.user!.id, req.user!.role, req.body);
  return res.json(successResponse(ticket, 'Ticket updated.'));
});
