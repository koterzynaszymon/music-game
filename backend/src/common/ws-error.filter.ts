import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Socket } from 'socket.io';

// An exception filter catches errors thrown by handlers and decides what the
// client receives. Applied to a gateway with @UseFilters(WsErrorFilter), it
// replaces the identical try/catch that every handler used to have:
// any error is sent back to the socket that caused it as an "error" event.
@Catch()
export class WsErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();
    client.emit('error', {
      message: exception instanceof Error ? exception.message : 'Unexpected error',
    });
  }
}
