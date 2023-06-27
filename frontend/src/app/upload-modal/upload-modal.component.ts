import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageService } from '../image.service';
import { MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { uploadActivity } from '../interfaces/uploadactivity';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import { BytesPipe } from '../bytes.pipe';

@Component({
  selector: 'app-upload-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    BytesPipe
  ],
  templateUrl: './upload-modal.component.html',
  styleUrls: ['./upload-modal.component.css']
})
export class UploadModalComponent {

  loading: boolean = false;
  uploadTasks: uploadActivity[] = [];
  private uploadActivity$!: Subscription;

  constructor (
    public dialogRef: MatDialogRef<UploadModalComponent>,
    private imageService: ImageService
  ) {}

  handleUpload(event: any): void {
    this.loading = true;

    this.uploadActivity$ = this.imageService.uploadImages(event.target.files)
      .subscribe({
        next: (tasks: uploadActivity[]) => {
          this.uploadTasks = tasks;
        },
        error: (error: any) => {
          this.loading = false;
          console.log(error);
        }, 
        complete: () => {
          // when it completes un subscribe and send back the file names
          this.loading = false;
          this.uploadActivity$.unsubscribe();

          this.dialogRef.close(this.uploadTasks.map(task => task.fileName));
        }
      })
  }

}
