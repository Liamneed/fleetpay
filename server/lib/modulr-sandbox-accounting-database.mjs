// Never accept an application production database. The only durable sandbox
// database allowed is one explicitly named temporary fixture, not a directory.
import {realpathSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname} from 'node:path';
export function assertModulrSandboxAccountingDatabase(db){
 if(db.isTransaction)throw Error('Nested accounting transaction prohibited');
 const databases=db.prepare('PRAGMA database_list').all();
 if(databases.length!==1||databases[0].name!=='main')throw Error('Attached databases prohibited');
 const file=databases[0].file;
 if(!file)return;
 const configured=process.env.MODULR_APPLICATION_ACCOUNTING_FIXTURE_DB;
 if(process.env.MODULR_APPLICATION_ACCOUNTING_FILE_FIXTURE_ENABLED!=='true'||
    !configured||!existsSync(configured)||!existsSync(file))
  throw Error('Persistent application accounting restricted to explicit sandbox fixture');
 const real=realpathSync(file);
 if(real!==realpathSync(configured)||dirname(real)!==realpathSync(tmpdir())||
    !/^faivopay-modulr-application-fixture-[a-z0-9-]+\.sqlite$/.test(basename(real)))
  throw Error('Persistent application accounting restricted to explicit sandbox fixture');
}
