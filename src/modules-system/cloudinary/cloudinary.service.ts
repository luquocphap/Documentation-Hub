import { Injectable } from "@nestjs/common";
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from "cloudinary";
import { BACKEND_URL, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME, CLOUDINARY_FOLDER } from "../../common/constants/app.constant";
import * as streamifier from "streamifier";

@Injectable()
export class CloudinaryService {
    generatePresignedSignature(documentId: string, userId: string) {
        // Lấy timestamp hiện tại (tính bằng giây)
        const timestamp = Math.round(new Date().getTime() / 1000);
        
        // Nhúng documentId và userId vào context để Webhook biết file này thuộc về ai và tài liệu nào
        const context = `documentId=${documentId}|userId=${userId}`;
        
        // URL để Cloudinary gọi về báo cáo sau khi nhận file thành công
        const notification_url = `${BACKEND_URL}/api/document/webhook/cloudinary`;

        // Các tham số bắt buộc phải đưa vào quá trình ký
        const paramsToSign = {
            timestamp,
            folder: CLOUDINARY_FOLDER,
            context,
            notification_url
        };

        // Ký bằng Secret Key
        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            CLOUDINARY_API_SECRET as string
        );

        // Trả về toàn bộ thông số cho Frontend
        return {
            timestamp,
            signature,
            cloudName: CLOUDINARY_CLOUD_NAME,
            apiKey: CLOUDINARY_API_KEY,
            folder: CLOUDINARY_FOLDER,
            context,
            notification_url
        };
    }

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