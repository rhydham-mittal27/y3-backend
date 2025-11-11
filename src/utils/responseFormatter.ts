export const successResponse = (data: any, message?: string) => ({
  success: true,
  data,
  message,
});

export const errorResponse = (error: string, message: string) => ({
  success: false,
  error,
  message,
});

export const paginatedResponse = (
  data: any[],
  page: number,
  limit: number,
  total: number
) => ({
  success: true,
  data,
  pagination: {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  },
});
