
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const errorResponse = exception.getResponse() as {
        message?: string | string[];
    };

    const message = Array.isArray(errorResponse.message)
                    ? errorResponse.message[0] : errorResponse.message;

    response
      .status(status)
      .json({
        statusCode: status,
        status: "Fail",
        message: message
      });
  }
}
