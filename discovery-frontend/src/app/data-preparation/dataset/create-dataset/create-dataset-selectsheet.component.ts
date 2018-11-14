/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  ChangeDetectorRef,
  Component, ElementRef, EventEmitter, HostListener, Injector, Input, OnDestroy, OnInit, Output, SimpleChanges,
  ViewChild
} from '@angular/core';
import { AbstractPopupComponent } from '../../../common/component/abstract-popup.component';
import { PopupService } from '../../../common/service/popup.service';
import { DatasetFile } from '../../../domain/data-preparation/dataset';
import { Alert } from '../../../common/util/alert.util';
import { DatasetService } from '../service/dataset.service';
import { CookieConstant } from '../../../common/constant/cookie.constant';
import { CommonConstant } from '../../../common/constant/common.constant';
import { DomSanitizer } from '@angular/platform-browser';
import { GridComponent } from '../../../common/component/grid/grid.component';
import { header, SlickGridHeader } from '../../../common/component/grid/grid.header';
import { Field } from '../../../domain/datasource/datasource';
import { GridOption } from '../../../common/component/grid/grid.option';

import { isNullOrUndefined, isUndefined } from 'util';
import * as pixelWidth from 'string-pixel-width';

declare let plupload: any;

@Component({
  selector: 'app-create-dataset-selectsheet',
  templateUrl: './create-dataset-selectsheet.component.html',
})
export class CreateDatasetSelectsheetComponent extends AbstractPopupComponent implements OnInit, OnDestroy {

  /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
   | Private Variables
   |-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/
  @ViewChild('pickfiles')
  private pickfiles: ElementRef;

  @ViewChild('drop_container')
  private drop_container: ElementRef;

  @ViewChild(GridComponent)
  private gridComponent: GridComponent;

  // @ViewChild('fileUploadChange')
  // private fileUploadChange: ElementRef;

  private interval : any;

  /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
   | Protected Variables
   |-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/

  /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
   | Public Variables
   |-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/
  @Output()
  public typeEmitter = new EventEmitter<string>();

  @Input()
  public datasetFile: DatasetFile;

  public isCSV: boolean = false;

  // Column Delimiter - default value is comma
  public columnDelimiter : string = ',';

  // 파일 업로드 결과
  public uploadResult;

  public isChanged : boolean = false; // tell if uploaded file is changed

  // grid hide
  public clearGrid : boolean = false;

  // Change Detect
  public changeDetect: ChangeDetectorRef;

  public defaultSheetIndex : number = 0;

  public gridInfo : any;

  public chunk_uploader: any;
  private isUploadCancel :boolean = false;

  public progressbarWidth: string = '100%';
  public progressPercent : number = 0;
  public isUploading : boolean = false;
  /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
   | Constructor
   |-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/

  // 생성자
  constructor(private popupService: PopupService,
              private datasetService: DatasetService,
              protected elementRef: ElementRef,
              protected injector: Injector,
              public sanitizer: DomSanitizer) {

    super(elementRef, injector);

  }

  /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
   | Override Method
   |-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/

  // Init
  public ngOnInit() {

    super.ngOnInit();

    this.initPlupload();


    let fileType : string = new RegExp(/^.*\.(csv|xls|txt|xlsx|json)$/).exec( this.datasetFile.filename )[1];


    if (fileType === 'csv' || fileType === 'txt') {
      this.isCSV = true;
      this.getDataFile();

    } else {
      this.datasetFile.sheetIndex = 0;

      if(this.datasetFile.delimiter) { // delimiter 를 바꾼게 있다면 그걸 사용한다
        this.columnDelimiter = this.datasetFile.delimiter;
      }

      if(0 === this.datasetFile.selectedSheets.length) { // 벌써 선택된 sheet가 있다면 converting 필요 없다
        this.convertSheet();
      }
      this.getDataFile();
    }

  }

  public ngOnDestroy() {
    super.ngOnDestroy();

    this.chunk_uploader = null;
  }

  /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
   | Public Method
   |-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/

  public cancelClick(param:boolean){
    let elm = $('.ddp-wrap-progress');
    if (param) {
      if(this.progressPercent === 100) {
        Alert.info('Generating completed');
        this.isUploadCancel = false;
        this.chunk_uploader.start();
        this.isUploading = false;

      } else {
        this.isUploadCancel = true;
        this.chunk_uploader.stop();
        elm[0].style.display = "none";
        elm[1].style.display = "";
      }
    } else {
      this.isUploadCancel = false;
      this.chunk_uploader.start();
      elm[0].style.display = "";
      elm[1].style.display = "none";
    }
  }

  public cancelUpload(){
    this.isUploadCancel = true;
    this.chunk_uploader.stop();
    this.chunk_uploader.start();
    this.isUploadCancel = false;
    this.isUploading = false;
  }
  public startUpload(){
    this.isUploading = true;
    this.isUploadCancel = false;
    this.chunk_uploader.start();
  }

  public initPlupload() {
    this.chunk_uploader = new plupload.Uploader({
      runtimes : 'html5,html4',
      chunk_size: '0',
      browse_button : this.pickfiles.nativeElement,
      drop_element : this.drop_container.nativeElement,
      url : CommonConstant.API_CONSTANT.API_URL + 'preparationdatasets/upload_async',
      headers:{
        'Accept': 'application/json, text/plain, */*',
        'Authorization': this.cookieService.get(CookieConstant.KEY.LOGIN_TOKEN_TYPE) + ' ' + this.cookieService.get(CookieConstant.KEY.LOGIN_TOKEN)
      },
      filters : {
        max_file_size : '10gb',
        prevent_duplicate: true,
        mime_types: [
          {title: "Datapreparation files", extensions: "csv,txt,xls,xlsx,json"}
        ],

      },
      multipart_params: {
        file_key : '',
        upload_target: '',
        total_size : ''
      },
      init: {
        PostInit: () => {
          for ( let idx in this.chunk_uploader.settings.multipart_params){
            this.chunk_uploader.settings.multipart_params[idx] = '';
          };
        },

        FilesAdded: (up, files) => {
          if (files && files.length > 1){
            plupload.each(files, (file) => {
              up.removeFile(file);
            });
            Alert.error('Only one file can be uploaded.');
          } else {
            plupload.each(files, (file) => {
              this.chunk_uploader.settings.multipart_params.total_size = file.size;

              // get and set file_key, chunk_size, upload_target

              this.chunk_uploader.setOption('chunk_size','0');
              //this.chunk_uploader.settings.multipart_params.file_key = '';
              //this.chunk_uploader.settings.multipart_params.upload_target = '';

            });
            this.startUpload();

          }
        },

        UploadProgress: (up, file) => {
          this.progressPercent = file.percent;
          this.progressbarWidth = file.percent + "%";
          this.drop_container.nativeElement.click();
        },

        // BeforeUpload: (up, file)=>{
        // },

        UploadFile: (up,file)=>{
          if (this.isUploadCancel) {
            up.removeFile(file);
            for ( let idx in this.chunk_uploader.settings.multipart_params){
              this.chunk_uploader.settings.multipart_params[idx] = ''
            };
          }
        },

        FileUploaded: (up, file, info)=>{
          this.isUploading = false;

          const success = true;
          let res = info.response;
          this.uploadResult = { success, res };
          this.checkIfUploaded(res);
        },

        // BeforeChunkUpload: (up, file, args, blob, offset)=>{
        // },
        // ChunkUploaded: (up, file, info)=>{
        // },

        /* error define
        -100 GENERIC_ERROR
        -200 HTTP_ERROR
        -300 IO_ERROR
        -400 SECURITY_ERROR
        -500 INIT_ERROR
        -600 FILE_SIZE_ERROR
        -601 FILE_EXTENSION_ERROR
        -602 FILE_DUPLICATE_ERROR
        -701 MEMORY_ERROR
         */
        Error: (up, err) => {
          this.cancelUpload();
          this.drop_container.nativeElement.click();
          switch (err.code){
            case -601:
              Alert.error(this.translateService.instant('msg.dp.alert.file.format.wrong'));
              break;
            default:
              Alert.error(err.message);
          }
        }
      }
    });

    this.chunk_uploader.init();
  }

  // Convert array to object
  public convertSheet() {
    // 초기화
    this.datasetFile.selectedSheets = [];

    // 배열로 받아온 데이터를 오브젝트로 변환한다
    this.datasetFile.sheets.filter((item) => {
      let temp = {
        name :'',
        selected : false // 처음엔 selected 된 것이 없기 떄문에
      };
      temp.name = item;
      this.datasetFile.selectedSheets.push(temp);
    });
  }


  // excel 시 sheet 아이디 세팅
  public setDataSetSheetIndex(event,sheetname, idx) {
    event.stopPropagation();

    this.isChanged = false;
    this.defaultSheetIndex = idx;
    this.datasetFile.sheetname = sheetname;
    this.datasetFile.sheetIndex = idx;

    // this.getDataFile();

    if (!isNullOrUndefined(this.gridInfo) && this.gridInfo[this.defaultSheetIndex]) {
      this.updateGrid(this.gridInfo[this.defaultSheetIndex].data, this.gridInfo[this.defaultSheetIndex].fields);
    } else {
      this.clearGrid = true;
    }
  }


  /**
   * Move to next step
   */
  public next() {

    this.datasetFile.delimiter = this.columnDelimiter;

    if(isUndefined(this.datasetFile.delimiter) || this.datasetFile.delimiter === '' ){
      this.columnDelimiter = '';
      Alert.warning(this.translateService.instant('msg.dp.alert.col.delim.required'));
      return;
    }

    if (this.clearGrid) {
      return;
    }

    this.typeEmitter.emit('FILE');
    this.popupService.notiPopup({
      name: 'create-dataset-name',
      data: null
    });

  }

  /**
   * When delimiter is changed
   */
  public changeDelimiter() {

    // No change in grid when delimiter is empty
    if (isNullOrUndefined(this.columnDelimiter) || '' === this.columnDelimiter) {
      return;
    }

    this.isChanged = true;
    this.loadingShow();
    this.getGridInformation(this.getParamForGrid());

  }


  /**
   * Previous step
   */
  public prev() {
    super.close();
    this.popupService.notiPopup({
      name: 'close-create',
      data: null
    });
  }

  /**
   * Close
   */
  public close() {
    super.close();

    // Check if came from dataflow
    if (this.datasetService.dataflowId) {
      this.datasetService.dataflowId = undefined;
    }

    this.popupService.notiPopup({
      name: 'close-create',
      data: null
    });
  }


  /**
   * Get grid information of file
   * getGridInformation 이랑 중복 함수 .. 리팩토링 필요 ! DRY !
   */
  public getDataFile() {
    if (isUndefined(this.datasetFile)) {
      return;
    }

    if(this.isChanged) { // when uploaded file is changed
      this.defaultSheetIndex = 0;
      const response: any = this.uploadResult.response;
      this.datasetFile.filename = response.filename;
      this.datasetFile.filepath = response.filepath;
      this.datasetFile.sheets = response.sheets;
      if (response.sheets && response.sheets.length > 0) {
        this.datasetFile.sheetname = response.sheets[0];
        this.convertSheet();
      } else {
        this.datasetFile.sheetname = '';
      }
      this.datasetFile.filekey = response.filekey;
    }

    this.loadingShow();

    this.getGridInformation(this.getParamForGrid());
  }


  public getGridStyle() {
    if( this.datasetFile.sheetname && ''!==this.datasetFile.sheetname) {
      return null;
    }
    return {'top':'0px'};
  }

  /**
   * Check if uploaded
   * @param response
   */
  public checkIfUploaded(response: any) {
    let res = JSON.parse(response);
    this.fetchUploadStatus(res.filekey);
    this.interval = setInterval(() => {
      this.fetchUploadStatus(res.filekey);
    }, 1000)
  }

  /**
   * Polling
   * @param {string} fileKey
   */
  public fetchUploadStatus(fileKey: string) {
    this.datasetService.checkFileUploadStatus(fileKey).then((result) => {

      if (result.state === 'done'  && result.success) {
        clearInterval(this.interval);
        this.interval = undefined;
        this.isChanged = true;
        this.uploadResult.response = result;
        this.getDataFile();
      }  else if (result.success === false) { // upload failed

        this.loadingHide();
        Alert.error(this.translateService.instant('Failed to upload. Please select another file'));
        clearInterval(this.interval);
        this.interval = undefined;
        return;
      }
    });
  }


  /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
   | Private Method
   |-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/
  /**
   * 헤더정보 얻기
   * @param {Field[]} fields
   * @returns {header[]}
   */
  private getHeaders(fields: Field[]) {
    return fields.map(
      (field: Field) => {

        /* 70 는 CSS 상의 padding 수치의 합산임 */
        const headerWidth:number = Math.floor(pixelWidth(field.name, { size: 12 })) + 70;

        return new SlickGridHeader()
          .Id(field.name)
          .Name('<span style="padding-left:20px;"><em class="' + this.getFieldTypeIconClass(field.logicalType.toString()) + '"></em>' + field.name + '</span>')
          .Field(field.name)
          .Behavior('select')
          .Selectable(false)
          .CssClass('cell-selection')
          .Width(headerWidth)
          .CannotTriggerInsert(true)
          .Resizable(true)
          .Unselectable(true)
          .Sortable(true)
          .build();
      }
    );
  }

  /**
   * grid 정보 업데이트
   * @param data
   * @param {Field[]} fields
   */
  private updateGrid(data: any, fields: Field[]) {

    if (data.length > 0 && fields.length > 0) {
      this.clearGrid = false;
      // headers
      const headers: header[] = this.getHeaders(fields);
      // rows
      const rows: any[] = this.getRows(data);
      // grid 그리기
      this.drawGrid(headers, rows);
    } else {
      this.clearGrid = true;
    }


  }

  /**
   * Draw grid
   * @param {any[]} headers
   * @param {any[]} rows
   */
  private drawGrid(headers: any[], rows: any[]) {
    this.changeDetect.detectChanges();
    this.gridComponent.create(headers, rows, new GridOption()
      .SyncColumnCellResize(true)
      .MultiColumnSort(true)
      .RowHeight(32)
      .build()
    );
    this.loadingHide();
  }

  /**
   * Find number of rows
   * @param data
   * @returns {any[]}
   */
  private getRows(data: any) {
    let rows: any[] = data;
    if (data.length > 0 && !data[0].hasOwnProperty('id')) {
      rows = rows.map((row: any, idx: number) => {
        row.id = idx;
        return row;
      });
    }
    return rows;
  }


  /**
   * Get grid information
   */
  private getGridInformation(param) {

    this.datasetService.getFileGridInfo(param).then((result) => {
      if (result.grids.length > 0) {
        this.clearGrid = false;
        this.gridInfo = result.grids;
        this.updateGrid(this.gridInfo[this.defaultSheetIndex].data , this.gridInfo[this.defaultSheetIndex].fields);
      } else {
        this.gridInfo = [];
        this.clearGrid = true;
      }
      this.loadingHide();
    }).catch((error) => {
      this.clearGrid = true;
      this.loadingHide();
    });
  }

  private getParamForGrid() {
    return {
      fileKey : this.datasetFile.filekey,
      sheetname : this.datasetFile.sheetname,
      delimiter : this.columnDelimiter,
      fileType : new RegExp(/^.*\.(csv|xls|txt|xlsx|json)$/).exec( this.datasetFile.filename )[1]
    };
  }


  /**
   * Go to next stage with enter key
   * @param event Event
   */
  @HostListener('document:keydown.enter', ['$event'])
  private onEnterKeydownHandler(event: KeyboardEvent) {
    if(event.keyCode === 13 ) {
      this.next();
    }
  }


  /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
   | Protected Method
   |-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=*/


}
