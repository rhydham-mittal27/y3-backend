import Ticket from '../models/Ticket';
import User from '../models/User';
import FinalClass from '../models/FinalClass';
import Notification from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';

// ─── Create Ticket (called from raise-concern flow) ───────────────────────────

export const createTicket = async (
  raisedByUserId: string,
  payload: {
    type?:        'CONCERN' | 'COMPLAINT' | 'QUERY' | 'TECHNICAL' | 'OTHER';
    subject:      string;
    description:  string;
    priority?:    'LOW' | 'MEDIUM' | 'HIGH';
    finalClassId?: string;
  },
) => {
  const user = await User.findById(raisedByUserId).select('name');
  if (!user) throw new ErrorResponse('User not found', 404);

  let studentName: string | undefined;
  let assignedTo: string | undefined;
  let assignedToName: string | undefined;

  if (payload.finalClassId) {
    const cls = await FinalClass.findOne({ _id: payload.finalClassId, parent: raisedByUserId })
      .populate('coordinator', 'name');
    if (cls) {
      studentName = cls.studentName;
      const coord = cls.coordinator as any;
      if (coord?._id) {
        assignedTo     = String(coord._id);
        assignedToName = coord.name;
      }
    }
  }

  const ticket = await Ticket.create({
    type:          payload.type ?? 'CONCERN',
    subject:       payload.subject,
    description:   payload.description,
    priority:      payload.priority ?? 'MEDIUM',
    raisedBy:      raisedByUserId,
    raisedByName:  user.name,
    finalClass:    payload.finalClassId,
    studentName,
    assignedTo,
    assignedToName,
  });

  // Notify assigned coordinator (if any)
  if (assignedTo) {
    await Notification.create({
      recipient: assignedTo,
      type:      'GENERAL',
      title:     `New Ticket ${ticket.ticketNumber}`,
      message:   `${user.name} raised a ticket: "${payload.subject}"`,
    });
  }

  return ticket;
};

// ─── Parent: list own tickets ─────────────────────────────────────────────────

export const getMyTickets = async (userId: string) => {
  return Ticket.find({ raisedBy: userId })
    .sort({ createdAt: -1 })
    .select('ticketNumber type status priority subject createdAt resolvedAt resolutionNote comments')
    .lean();
};

// ─── Coordinator / Admin: list tickets ───────────────────────────────────────

export const getTicketsForStaff = async (
  userId: string,
  role: string,
  filters: { status?: string; priority?: string; page?: number; limit?: number },
) => {
  const page  = filters.page  ?? 1;
  const limit = filters.limit ?? 20;

  const query: any = {};

  // Coordinators only see tickets assigned to them; admins/managers see all
  if (role === 'COORDINATOR') {
    query.assignedTo = userId;
  }

  if (filters.status)   query.status   = filters.status;
  if (filters.priority) query.priority = filters.priority;

  const [tickets, total] = await Promise.all([
    Ticket.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('ticketNumber type status priority subject raisedByName studentName assignedToName createdAt resolvedAt comments')
      .lean(),
    Ticket.countDocuments(query),
  ]);

  return { tickets, total, page, limit };
};

// ─── Get single ticket ────────────────────────────────────────────────────────

export const getTicketById = async (ticketId: string, userId: string, role: string) => {
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) throw new ErrorResponse('Ticket not found', 404);

  const isOwner   = String(ticket.raisedBy) === userId;
  const isAssigned = String(ticket.assignedTo) === userId;
  const isAdmin   = ['ADMIN', 'MANAGER'].includes(role);

  if (!isOwner && !isAssigned && !isAdmin) {
    throw new ErrorResponse('Not authorized to view this ticket', 403);
  }

  return ticket;
};

// ─── Add comment ─────────────────────────────────────────────────────────────

export const addTicketComment = async (
  ticketId: string,
  userId: string,
  role: string,
  message: string,
) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new ErrorResponse('Ticket not found', 404);

  const isOwner    = String(ticket.raisedBy) === userId;
  const isAssigned = String(ticket.assignedTo) === userId;
  const isAdmin    = ['ADMIN', 'MANAGER'].includes(role);

  if (!isOwner && !isAssigned && !isAdmin) {
    throw new ErrorResponse('Not authorized', 403);
  }

  const user = await User.findById(userId).select('name');

  ticket.comments.push({
    author:     userId as any,
    authorName: user?.name ?? 'Unknown',
    authorRole: role,
    message,
    createdAt:  new Date(),
  } as any);

  // Auto-move to IN_PROGRESS when staff replies to an OPEN ticket
  if (ticket.status === 'OPEN' && !isOwner) {
    ticket.status = 'IN_PROGRESS';
  }

  await ticket.save();

  // Notify the other party
  const notifyId = isOwner ? ticket.assignedTo : ticket.raisedBy;
  if (notifyId) {
    await Notification.create({
      recipient: notifyId,
      type:      'GENERAL',
      title:     `Reply on ${ticket.ticketNumber}`,
      message:   `${user?.name ?? 'Someone'} replied to ticket "${ticket.subject}".`,
    });
  }

  return ticket;
};

// ─── Update status / assign ───────────────────────────────────────────────────

export const updateTicketStatus = async (
  ticketId: string,
  userId: string,
  role: string,
  update: { status?: string; assignedTo?: string; priority?: string; resolutionNote?: string },
) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new ErrorResponse('Ticket not found', 404);

  const isAssigned = String(ticket.assignedTo) === userId;
  const isAdmin    = ['ADMIN', 'MANAGER'].includes(role);

  if (!isAssigned && !isAdmin) throw new ErrorResponse('Not authorized', 403);

  if (update.status) {
    ticket.status = update.status as any;
    if (update.status === 'RESOLVED' || update.status === 'CLOSED') {
      ticket.resolvedAt      = new Date();
      ticket.resolvedBy      = userId as any;
      const u = await User.findById(userId).select('name');
      ticket.resolvedByName  = u?.name;
      ticket.resolutionNote  = update.resolutionNote ?? ticket.resolutionNote;
    }
  }

  if (update.assignedTo) {
    const assignee = await User.findById(update.assignedTo).select('name');
    ticket.assignedTo     = update.assignedTo as any;
    ticket.assignedToName = assignee?.name;
  }

  if (update.priority) ticket.priority = update.priority as any;

  await ticket.save();

  // Notify parent when resolved
  if (update.status === 'RESOLVED') {
    await Notification.create({
      recipient: ticket.raisedBy,
      type:      'GENERAL',
      title:     `Ticket ${ticket.ticketNumber} Resolved`,
      message:   update.resolutionNote
        ? `Your ticket has been resolved: ${update.resolutionNote}`
        : `Your ticket "${ticket.subject}" has been resolved.`,
    });
  }

  return ticket;
};

// ─── Stats for coordinator dashboard ─────────────────────────────────────────

export const getTicketStats = async (userId: string, role: string) => {
  const match: any = role === 'COORDINATOR' ? { assignedTo: userId } : {};

  const [open, inProgress, resolved, total] = await Promise.all([
    Ticket.countDocuments({ ...match, status: 'OPEN' }),
    Ticket.countDocuments({ ...match, status: 'IN_PROGRESS' }),
    Ticket.countDocuments({ ...match, status: 'RESOLVED' }),
    Ticket.countDocuments(match),
  ]);

  return { open, inProgress, resolved, total };
};
