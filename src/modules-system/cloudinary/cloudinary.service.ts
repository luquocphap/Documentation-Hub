import { Injectable } from "@nestjs/common";
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from "cloudinary";
import { CLOUDINARY_FOLDER } from "../../common/constants/app.constant";
import * as streamifier from "streamifier";

@Injectable()
export class CloudinaryService {
    async uploadFile(file: Express.Multer.File): Promise<UploadApiResponse | UploadApiErrorResponse> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: CLOUDINARY_FOLDER
                },

                (error, result) => {
                    if (error) {
                        return reject(error);
                    }
                    
                    if (result) {
                        resolve(result);
                    } else {
                        reject(new Error('Upload failed - No result from Cloudinary'));
                    }
                },
            )

            // Chuyển buffer thành dạng luồng (stream) và pipe vào uploadStream
            streamifier.createReadStream(file.buffer).pipe(uploadStream);
        })
    }

    async deleteFile(public_id: string): Promise<any> {
        return new Promise((resolve, reject) => {
            cloudinary.uploader.destroy(public_id, (error, result) => {
                if (error){
                    reject(error)
                }

                resolve(result)
            })
        })
    }
}