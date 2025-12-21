import { MediaType } from '~/constants/enum'

/**
 * Interface cho Media object (Image/Video)
 * Được trả về sau khi upload lên S3
 */
export interface Media {
    url: string // S3 URL của file
    type: MediaType // 0: Image, 1: Video
}
