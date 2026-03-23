import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from api.deps import get_db_path
from recipe_extractor.exporter import export_to_excel

router = APIRouter()

@router.get("/export")
def api_export(db: Path = Depends(get_db_path)):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"recipes_{timestamp}.xlsx"
    tmp = Path(tempfile.mkdtemp()) / filename
    export_to_excel(output_path=tmp, db_path=db)
    return FileResponse(
        path=tmp,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
