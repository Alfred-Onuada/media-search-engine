import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ImageService } from './image.service';
import { MatCardModule } from '@angular/material/card';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UploadModalComponent } from './upload-modal/upload-modal.component';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatIconModule,
    MatCardModule,
    NgxSkeletonLoaderModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title: string = 'frontend';
  placeholder: string = '';
  images: string[] = [];
  loading: boolean = true;
  error: string = '';
  query: string = '';

  // skeletonStyle
  skeletonCss: object = {
    height: window.innerWidth < 600 ? '200px' : '350px',
    margin: '.5vw',
    borderRadius: '5px',
    width: window.innerWidth < 600 ? '49vw' : [window.innerWidth < 768 ? '32vw' : '24vw']
  }

  baseUrl: string = environment.apiUrl;

  constructor(
    private imageService: ImageService,
    private dialog: MatDialog
  ) { }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    })
  }

  async updatePlaceholder(idx: number): Promise<void> {
    this.placeholder = "";

    const samplePlaceholders: string[] = [
      'Search something...',
      'Cat playing a piano',
      'Dog on a bike',
      'My wedding cake',
      'My graduation ceremony'
    ]

    for (const letter of samplePlaceholders[idx]) {
      this.placeholder += letter;

      await this.sleep(50);
    }

    await this.sleep(1500);

    if (idx < samplePlaceholders.length - 1) {
      this.updatePlaceholder(idx + 1);
    } else {
      this.updatePlaceholder(0);
    }
  }

  ngOnInit(): void {
    this.updatePlaceholder(0);

    this.fetchPictures();
  }

  fetchPictures(): void {
    this.imageService.getImages().subscribe({
      next: (data: string[]) => {
        this.images = data;
      },
      error: async (error: HttpErrorResponse) => {
        this.error = error.error.message;
        this.loading = false;

        await this.sleep(3000);
        this.error = "";
      },
      complete: () => this.loading = false
    })
  }

  searchImages(): void {
    this.loading = true;
    this.images = [];

    this.imageService.findImages(this.query)
      .subscribe({
        next: (data: string[]) => {
          this.images = data;
        },
        error: async (error: HttpErrorResponse) => {
          this.error = error.error.message;
          this.loading = false;

          await this.sleep(3000);
          this.error = "";
          this.fetchPictures();
        },
        complete: () => this.loading = false
      })
  }

  checkKey(event: any): void {
    if (event.code === 'Enter' && this.loading === false) {
      this.searchImages();
    }

    if (this.query === '') {
      this.fetchPictures();
    }
  }

  openUploadModal(): void {
    this.dialog.open(UploadModalComponent)
      .afterClosed()
      .subscribe({
        next: (images: string[]) => this.images.unshift(...images),
        error: console.log
      })
  }
}
