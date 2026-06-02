import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DATABASE_URL } from 'src/common/constants/app.constant';

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

@Global()
@Module({
  imports: [
    MongooseModule.forRoot(DATABASE_URL, {
      autoIndex: process.env.NODE_ENV !== 'production',
      connectionFactory: (connection) => {
        connection.on('connected', () => {
          console.log('MongoDB connected successfully');
        });

        connection.on('error', (error) => {
          console.error('MongoDB connection error:', error);
        });

        return connection;
      },
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}