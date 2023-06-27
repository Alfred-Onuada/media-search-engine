import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map, take } from 'rxjs';
import { FirebaseApp } from '@angular/fire/app';
import { getStorage, ref } from '@angular/fire/storage';
import { environment } from 'src/environments/environment';
import { StorageError, UploadTaskSnapshot, uploadBytesResumable } from 'firebase/storage';
import { uploadActivity } from './interfaces/uploadactivity';
import { v4 as uuidv4 } from 'uuid';

interface httpResp {
  message: string,
  data: any[]
}

@Injectable({
  providedIn: 'root',
})
export class ImageService {

  private baseUrl: string = environment.apiUrl;
  private uploadTasks = new BehaviorSubject<uploadActivity[]>([]);

  constructor(
    private http: HttpClient,
    private firebaseClient: FirebaseApp
  ) { }

  getImages(): Observable<string[]> {
    return this.http.get<httpResp>(this.baseUrl)
      .pipe(
        map(value => value.data)
      )
  }

  findImages(query: string): Observable<string[]> {
    return this.http.get<httpResp>(`${this.baseUrl}/search?query=${query}`)
      .pipe(
        map(value => value.data)
      )
  }

  uploadImages(files: any[]): Observable<uploadActivity[]> {
    // the firebase client needs to be initialized
    const storage = getStorage(this.firebaseClient);

    // Add each file to the FormData
    for (let i = 0; i < files.length; i++) {
      const fileRef = ref(storage, `${uuidv4()}.${files[i].type.replace('image/', '')}`);

      uploadBytesResumable(fileRef, files[i])
        .on("state_changed", {
          next: (snapshot: UploadTaskSnapshot) => {
            this.updateUploadActivity(snapshot);
          },
          error: (error: StorageError) => {
            this.failUploadActivity(error);
          },
          complete: () => {}
        })
    }

    return this.uploadTasks.asObservable()
  }
 
  failUploadActivity(error: StorageError) {
    console.log(error);
  }

  updateUploadActivity(snapshot: UploadTaskSnapshot) {
    // check if snapshot exists and update
    let exists = false;
    const currentTasks = this.uploadTasks.getValue();

    const updatedTasks = currentTasks.map(task => {
      if (task.fileName === snapshot.ref.fullPath) {
        exists = true;

        // check if the task has completed
        if (snapshot.bytesTransferred === snapshot.totalBytes) {
          return {
            ...task,
            transferedBytes: snapshot.bytesTransferred,
            completed: true
          }
        } else {
          return {
            ...task,
            transferedBytes: snapshot.bytesTransferred
          }
        }
      } else {
        return task;
      }
    })

    // insert snapshot
    if (exists === false) {
      updatedTasks.push({
        totalBytes: snapshot.totalBytes,
        completed: false,
        failed: false,
        fileName: snapshot.ref.fullPath,
        transferedBytes: snapshot.bytesTransferred,
      })
    }

    // emit a new value
    this.uploadTasks.next(updatedTasks);

    // if all the uploads are done end the subscription
    const pending = updatedTasks.filter(task => task.completed !== true);

    if (pending.length === 0) {
      this.uploadTasks.complete();
    }
  }
}
