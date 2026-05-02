$ErrorActionPreference = 'Stop'

$projectUrl = 'https://services7.arcgis.com/wkSH3B0op2WjGe48/arcgis/rest/services/EXPLORACION_CAMPO/FeatureServer/3'
$collarUrl = 'https://services7.arcgis.com/wkSH3B0op2WjGe48/arcgis/rest/services/EXPLORACION_CAMPO/FeatureServer/0'

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$projectCode = "COPILOT_TEST_$stamp"
$holeId = "COLLAR_TEST_$stamp"

$projectFeatures = @(
  @{
    attributes = @{
      COD_EXPLORACION = $projectCode
      CONCESION_AREA = 'PRUEBA_SYNC'
      COD_CATASTRAL = 'TEST-001'
      LOCALIZACION = 'PRUEBA CONTROLADA'
      TECNICO = 'Copilot'
      SR_PROYECTO = 'WGS84_UTM_17S'
    }
  }
) | ConvertTo-Json -Compress -Depth 8

$projectResponse = Invoke-RestMethod `
  -Method Post `
  -Uri "$projectUrl/addFeatures" `
  -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' `
  -Body @{ f = 'json'; features = $projectFeatures }

if (-not $projectResponse.addResults[0].success) {
  throw "Fallo addFeatures PROYECTO: $($projectResponse | ConvertTo-Json -Depth 10)"
}

$projectObjectId = $projectResponse.addResults[0].objectId
$projectGlobalId = $projectResponse.addResults[0].globalId

$dateMs = [DateTimeOffset]::Parse('2026-04-07T00:00:00Z').ToUnixTimeMilliseconds()

$collarFeatures = @(
  @{
    geometry = @{
      x = -79.099692
      y = -1.971473
      z = 0
      spatialReference = @{ wkid = 4326 }
    }
    attributes = @{
      PROYECTO_GUID = $projectGlobalId
      HOLE_ID = $holeId
      ESTE = -79.099692
      NORTE = -1.971473
      ELEVACION = 0
      PROF_TOTAL = 25
      TIPO = 'POZO'
      LOCALIZACION = 'PRUEBA CONTROLADA'
      FECHA = $dateMs
      palabra = $null
    }
  }
) | ConvertTo-Json -Compress -Depth 10

$collarResponse = Invoke-RestMethod `
  -Method Post `
  -Uri "$collarUrl/addFeatures" `
  -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' `
  -Body @{ f = 'json'; features = $collarFeatures }

if (-not $collarResponse.addResults[0].success) {
  throw "Fallo addFeatures COLLAR: $($collarResponse | ConvertTo-Json -Depth 10)"
}

$collarObjectId = $collarResponse.addResults[0].objectId

$deleteCollar = Invoke-RestMethod `
  -Method Post `
  -Uri "$collarUrl/deleteFeatures" `
  -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' `
  -Body @{ f = 'json'; objectIds = $collarObjectId }

$deleteProject = Invoke-RestMethod `
  -Method Post `
  -Uri "$projectUrl/deleteFeatures" `
  -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' `
  -Body @{ f = 'json'; objectIds = $projectObjectId }

[PSCustomObject]@{
  projectCode = $projectCode
  projectObjectId = $projectObjectId
  projectGlobalId = $projectGlobalId
  collarHoleId = $holeId
  collarObjectId = $collarObjectId
  projectCreated = $projectResponse.addResults[0].success
  collarCreated = $collarResponse.addResults[0].success
  collarDeleted = $deleteCollar.deleteResults[0].success
  projectDeleted = $deleteProject.deleteResults[0].success
} | ConvertTo-Json -Depth 5