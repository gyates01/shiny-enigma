import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.background import BackgroundTasks
from fastapi.responses import FileResponse

from api.deps import get_db_path
from recipe_extractor.exporter import export_to_excel

router = APIRouter()

@router.get("/export")
def api_export(background_tasks: BackgroundTasks, db: Path = Depends(get_db_path)):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"recipes_{timestamp}.xlsx"
    tmp_dir = Path(tempfile.mkdtemp())
    tmp_file = tmp_dir / filename
    export_to_excel(output_path=tmp_file, db_path=db)
    background_tasks.add_task(shutil.rmtree, tmp_dir, ignore_errors=True)
    return FileResponse(
        path=tmp_file,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
