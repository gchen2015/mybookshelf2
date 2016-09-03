import {inject} from 'aurelia-framework';
import {ApiClient} from 'lib/api-client';
import {LogManager} from 'aurelia-framework';
import {Access} from 'lib/access';
import {DialogService} from 'aurelia-dialog';
import {ConfirmDialog} from 'components/confirm-dialog';
import {WSClient} from 'lib/ws-client';

let logger = LogManager.getLogger('ebooks');

@inject(ApiClient, WSClient, Access, DialogService)
export class Ebook {
  ebook
  constructor(client, ws, access, dialog ) {
    this.client=client;
    this.ws = ws;
    this.access=access;
    this.dialog =  dialog;
    this.token = access.token;
    this.canDownload=access.hasRole('user');
    this.canConvert=access.hasRole('user');
    this.cover = new Image();
    this.cover.onload = function() {
        URL.revokeObjectURL(this.src);
      }

  }


  get isEditable() {
    return this.ebook && this.access.canEdit(this.ebook.created_by);
  }

  canActivate(params) {
    return this.client.getOne('ebooks', params.id)
      .then(b => {
        this.ebook=b;
        return this.client.getCover('ebooks', b.id)
          .then (blob => {
            this.cover.src = URL.createObjectURL(blob);
            return true })
          .catch(err => {
            logger.warn(`Cannot load cover for ebook ${b.id}: ${err}`);
            return true
          })
        return true;})
      .catch(err => {
        logger.error(`Failed to load ${err}`);
        return false;
      });
  }

  activate(params) {
    this.client.getManyUnpaged(`ebooks/${this.ebook.id}/converted`)
    .then(data => this.convertedSources = data.items)
    .catch(err => logger.error('Cannot get converted sources',err))
  }

  attached() {
    if (this.cover.src)
      document.getElementById('cover-holder').appendChild(this.cover);
  }

  get searchString() {
    let s=''
    if (this.ebook.authors)
      s += this.ebook.authors.slice(0,2).map(a=> a.first_name? a.first_name+' '+a.last_name: a.last_name).join(' ');
    s += ' '+ this.ebook.title;
    return encodeURIComponent(s);
  }

  canDeleteSource(source) {
    return this.access.canEdit(source.created_by);
  }

  deleteSource(source) {
    this.dialog.open({
        viewModel: ConfirmDialog,
        model: {
          action: 'Delete',
          message: `Do you want to delete ${source.format} file from ebook ${this.ebook.title}?`
        }
      })
      .then(resp => {
        if (!resp.wasCancelled) {
        this.client.delete('sources', source.id)
          .then(res => {
            if (res.error) {
              logger.error('Source delete failed: ' + res.err);
            } else {
              let idx = this.ebook.sources.findIndex(x => x === source)
              if (idx >= 0) this.ebook.sources.splice(idx, 1);
            }
          })
          .catch(err => {
            logger.error('Server error: ' + err);
          })
        }
      });
  }

  get convertSource() {
    return (format,source) => {

      if (format != source.format) {
        this.ws.convertSource(source, format, this.ebook).then(
          taskId => {
            if (! source.active) source.active=1;
            else source.active += 1;
            logger.debug(`Converting ${JSON.stringify(source)} to ${format} in task ${taskId}`);
          })
          .catch(err => {
            alert('Conversion submission error');
            logger.error('Conversion submission error: '+JSON.stringify(err));
          });
        };
      }
  }


}
