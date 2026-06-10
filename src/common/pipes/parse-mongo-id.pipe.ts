import { PipeTransform, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

@Injectable()
export class ParseMongoIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    // Nếu giá trị truyền vào không phải là định dạng chuẩn của MongoDB ObjectId
    if (!Types.ObjectId.isValid(value)) {
      throw new NotFoundException('Tài nguyên không tồn tại');
    }
    return value;
  }
}